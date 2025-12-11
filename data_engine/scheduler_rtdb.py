import argparse
import schedule
import time
import os
from datetime import datetime, time as dt_time, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Optional
from firebase_admin import db as rtdb_admin
from firebase_admin import firestore

from fetcher import fetch_top_stocks, fetch_us_stocks, fetch_exchange_rate, fetch_single_stock, fetch_stock_history
from models import Stock
import firestore_client  # Initializes Firebase app
from firestore_client import db as firestore_db
from trade_executor import sell_stock
from dotenv import load_dotenv

# Load environment variables from .env file in the same directory
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

MARKET_TZ = ZoneInfo("Asia/Seoul")
FETCH_INTERVAL_MINUTES = 1
SYNC_INTERVAL_MINUTES = 1
STOCK_LIMIT = 200
DAILY_INTEREST_RATE = 0.001  # 0.1% per day

latest_snapshot: Dict[str, Stock] = {}
last_written_snapshot: Dict[str, Stock] = {}
latest_exchange_rate: float = 1400.0
held_stocks_cache: set[str] = set()

def now_kst() -> datetime:
    return datetime.now(MARKET_TZ)

def has_stock_changed(new: Stock, old: Stock) -> bool:
    return any((
        new.price != old.price,
        new.change != old.change,
        round(new.change_percent, 4) != round(old.change_percent, 4),
        new.name != old.name,
    ))

def fetch_job(force: bool = False):
    global latest_snapshot, latest_exchange_rate
    print("-" * 60)
    print(f"[{now_kst()}] Starting fetch job...")
    
    # Fetch KR Stocks
    # Pass held stocks to ensure they are fetched even if not in top 200
    kr_stocks = fetch_top_stocks(limit=STOCK_LIMIT, additional_symbols=held_stocks_cache)
    
    # Fetch US Stocks
    us_stocks = fetch_us_stocks()
    
    # Fetch Exchange Rate
    rate = fetch_exchange_rate()
    if rate:
        latest_exchange_rate = rate
        
    # Merge
    # Merge
    all_stocks = {**kr_stocks, **us_stocks}

    # Filter out stocks with price 0 (typically due to trading suspension, e.g., Taeyoung E&C)
    latest_snapshot = {s: stock for s, stock in all_stocks.items() if stock.price > 0}
    
    dropped_count = len(all_stocks) - len(latest_snapshot)
    if dropped_count > 0:
        print(f"[{now_kst()}] Filtered {dropped_count} stocks with 0 price.")

    print(f"[{now_kst()}] Total stocks fetched: {len(latest_snapshot)}. Exchange Rate: {latest_exchange_rate}")

def sync_job(force: bool = False):
    global last_written_snapshot
    if not latest_snapshot:
        print("No latest snapshot available yet.")
        return

    changed: Dict[str, Stock] = {}
    for symbol, stock in latest_snapshot.items():
        prev = last_written_snapshot.get(symbol)
        if prev is None or has_stock_changed(stock, prev):
            changed[symbol] = stock

    ref = rtdb_admin.reference('stocks')
    updates = {}
    
    # Sync Stocks
    if changed:
        for symbol, stock in changed.items():
            updates[symbol] = stock.to_dict()
            updates[symbol]['updatedAt'] = stock.updated_at.isoformat()
        
        ref.update(updates)
        print(f"[{now_kst()}] Updated {len(updates)} stocks in RTDB.")
    else:
        print(f"[{now_kst()}] No stock changes detected.")

    # --- Zero-Price Cleanup Logic ---
    # 1. Fetch ALL stocks currently in RTDB to catch any old zero-price stocks
    existing_rtdb_stocks = rtdb_admin.reference('stocks').get() or {}
    
    # 2. Identify stocks with 0 price (check both latest_snapshot and existing RTDB data)
    zero_price_symbols = set()
    
    # Check latest snapshot
    for s, stock in latest_snapshot.items():
        if stock.price == 0:
            zero_price_symbols.add(s)
            
    # Check existing RTDB data
    for s, data in existing_rtdb_stocks.items():
        # data is a dict here, not Stock object
        price = data.get('price', 0)
        if price == 0:
            zero_price_symbols.add(s)
            
    zero_price_symbols = list(zero_price_symbols)
    
    if zero_price_symbols:
        print(f"[{now_kst()}] Found {len(zero_price_symbols)} stocks with 0 price (Snapshot + RTDB): {zero_price_symbols}")
        
        # Fetch all held stocks to protect them
        held_stocks = set()
        try:
            # Query all portfolios to find what stocks are owned
            # Note: collection_group query might be slow if huge, but fine for now.
            portfolios = firestore_db.collection_group("portfolio").stream()
            for doc in portfolios:
                # doc.id is usually the symbol in our design (users/{uid}/portfolio/{symbol})
                held_stocks.add(doc.id)
        except Exception as e:
            print(f"Error fetching held stocks: {e}")
        
        print(f"Currently held stocks (protected): {len(held_stocks)}")
        
        for symbol in zero_price_symbols:
            if symbol in held_stocks:
                print(f"  -> {symbol} is held by users but has 0 price. Retrying fetch...")
                # Retry fetch
                new_stock = fetch_single_stock(symbol)
                if new_stock and new_stock.price > 0:
                    print(f"     SUCCESS: Fetched valid price for {symbol}: {new_stock.price}")
                    # Update snapshot and RTDB immediately
                    latest_snapshot[symbol] = new_stock
                    
                    # Fix: Handle datetime serialization
                    stock_dict = new_stock.to_dict()
                    stock_dict['updatedAt'] = new_stock.updated_at.isoformat()
                    
                    rtdb_admin.reference(f'stocks/{symbol}').set(stock_dict)
                    # Also update last_written so next sync doesn't think it changed again immediately
                    last_written_snapshot[symbol] = new_stock
                else:
                    print(f"     FAILED: {symbol} still has 0 price after retry.")
            else:
                # Not held, delete it
                print(f"  -> {symbol} is NOT held. Deleting from RTDB...")
                try:
                    rtdb_admin.reference(f'stocks/{symbol}').delete()
                    # Remove from local snapshots so we don't sync it back or track it
                    latest_snapshot.pop(symbol, None)
                    last_written_snapshot.pop(symbol, None)
                except Exception as e:
                    print(f"     Error deleting {symbol}: {e}")
    # --------------------------------

    # Sync Exchange Rate
    # We update this every sync interval to ensure clients have fresh data
    # or we could check if it changed. Let's just update it.
    rtdb_admin.reference('system/exchange_rate').set(latest_exchange_rate)
    print(f"[{now_kst()}] Synced Exchange Rate: {latest_exchange_rate}")

    last_written_snapshot = {symbol: stock for symbol, stock in latest_snapshot.items()}

def diff_in_days(last_date_str: str) -> int:
    if not last_date_str:
        return 0
    today = datetime.now().date()
    try:
        last_date = datetime.strptime(last_date_str, "%Y-%m-%d").date()
        return (today - last_date).days
    except ValueError:
        return 0

def process_daily_interest_and_liquidation():
    print(f"[{now_kst()}] Starting Daily Interest & Liquidation Job...")
    
    # Query users with usedCredit > 0
    users_ref = firestore_db.collection("users")
    query = users_ref.where("usedCredit", ">", 0)
    docs = query.stream()
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    
    count_interest = 0
    count_liquidated = 0
    
    for user_doc in docs:
        uid = user_doc.id
        user_data = user_doc.to_dict()
        
        used_credit = user_data.get("usedCredit", 0)
        credit_limit = user_data.get("creditLimit", 0)
        last_interest_date = user_data.get("lastInterestDate")
        
        # 1. Apply Interest
        days_diff = diff_in_days(last_interest_date)
        
        if days_diff > 0:
            interest = int(used_credit * DAILY_INTEREST_RATE * days_diff)
            new_used_credit = used_credit + interest
            
            try:
                users_ref.document(uid).update({
                    "usedCredit": new_used_credit,
                    "lastInterestDate": today_str
                })
                print(f"User {uid}: Applied interest {interest} KRW for {days_diff} days.")
                used_credit = new_used_credit # Update local var for liquidation check
                count_interest += 1
            except Exception as e:
                print(f"Error applying interest for user {uid}: {e}")
                continue
        elif not last_interest_date:
             # Initialize date if missing
             users_ref.document(uid).update({"lastInterestDate": today_str})

        # 2. Auto-Liquidation
        if used_credit > credit_limit:
            excess_credit = used_credit - credit_limit
            print(f"User {uid}: Over limit by {excess_credit}. Starting liquidation...")
            
            # Fetch Portfolio
            portfolio_ref = users_ref.document(uid).collection("portfolio")
            portfolio_docs = portfolio_ref.stream()
            
            # Simple strategy: Sell whatever we find until limit is satisfied
            # Ideally we should sort by something (e.g. LIFO), but for now simple iteration
            # To do LIFO properly we need transaction history or store purchase date in portfolio
            # The frontend did LIFO by querying transactions. Let's try to query transactions.
            
            # Fetch recent BUY transactions for LIFO
            tx_ref = firestore_db.collection("transactions")
            buy_txs = tx_ref.where("uid", "==", uid).where("type", "==", "BUY").order_by("timestamp", direction=firestore.Query.DESCENDING).limit(50).stream()
            
            portfolio_map = {d.id: d.to_dict() for d in portfolio_docs}
            
            liquidated_amount = 0
            
            # Strategy: Try to sell based on recent buys (LIFO)
            for tx in buy_txs:
                if liquidated_amount >= excess_credit:
                    break
                    
                tx_data = tx.to_dict()
                symbol = tx_data.get("symbol")
                
                if symbol not in portfolio_map:
                    continue
                    
                stock_info = latest_snapshot.get(symbol)
                if not stock_info:
                    # Fallback if stock not in current snapshot (e.g. delisted or error)
                    # We can't sell if we don't know price. Skip.
                    continue
                    
                current_price = stock_info.price
                owned_qty = portfolio_map[symbol].get("quantity", 0)
                
                if owned_qty <= 0:
                    continue
                
                # Calculate how much to sell
                remaining_excess = excess_credit - liquidated_amount
                net_price = current_price * 0.9995
                shares_needed = int(remaining_excess / net_price) + 1
                shares_to_sell = min(shares_needed, owned_qty)
                
                try:
                    print(f"  -> Selling {shares_to_sell} of {symbol} @ {current_price}")
                    proceeds = sell_stock(uid, symbol, current_price, shares_to_sell)
                    
                    # Update local tracking
                    liquidated_amount += proceeds
                    portfolio_map[symbol]['quantity'] -= shares_to_sell
                    count_liquidated += 1
                    
                except Exception as e:
                    print(f"  -> Failed to liquidate {symbol}: {e}")

            # Fallback: If still over limit, just iterate portfolio
            if liquidated_amount < excess_credit:
                 for symbol, item in portfolio_map.items():
                    if liquidated_amount >= excess_credit:
                        break
                    
                    qty = item.get("quantity", 0)
                    if qty <= 0: continue
                    
                    stock_info = latest_snapshot.get(symbol)
                    if not stock_info: continue
                    
                    current_price = stock_info.price
                    remaining_excess = excess_credit - liquidated_amount
                    net_price = current_price * 0.9995
                    shares_needed = int(remaining_excess / net_price) + 1
                    shares_to_sell = min(shares_needed, qty)
                    
                    try:
                        print(f"  -> [Fallback] Selling {shares_to_sell} of {symbol} @ {current_price}")
                        proceeds = sell_stock(uid, symbol, current_price, shares_to_sell)
                        liquidated_amount += proceeds
                        count_liquidated += 1
                    except Exception as e:
                        print(f"  -> Failed to liquidate {symbol}: {e}")

    print(f"[{now_kst()}] Daily Job Completed. Interest applied to {count_interest} users. Liquidated trades: {count_liquidated}")

def run_once_force():
    print("Force mode: fetching and syncing once.")
    fetch_job(force=True)
    sync_job(force=True)

def run_daily_job_now():
    print("Force running daily interest/liquidation job...")
    # We need prices for liquidation, so fetch first
    fetch_job()
    process_daily_interest_and_liquidation()

def refresh_held_stocks():
    global held_stocks_cache
    print(f"[{now_kst()}] Refreshing held stocks cache...")
    try:
        # 1. Load from User Portfolios
        # Optimization: verify if we can select only keys/ids. 
        # collection_group query.
        docs = firestore_db.collection_group("portfolio").stream()
        new_cache = set()
        for doc in docs:
            # doc.id is the symbol in our data model: users/{uid}/portfolio/{symbol}
            new_cache.add(doc.id)
        
        # 2. Load from Configuration File
        reserved_file = os.path.join(os.path.dirname(__file__), 'reserved_symbols.txt')
        if os.path.exists(reserved_file):
            try:
                with open(reserved_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith('#'):
                            continue
                        new_cache.add(line)
                print(f"[{now_kst()}] Loaded reserved symbols from file.")
            except Exception as e:
                print(f"Error reading reserved_symbols.txt: {e}")

        held_stocks_cache = new_cache
        print(f"[{now_kst()}] Held stocks cache refreshed. Count: {len(held_stocks_cache)} (Held + Reserved)")
        print(f"DEBUG: Current Held Stocks Cache: {held_stocks_cache}")
    except Exception as e:
        print(f"Error refreshing held stocks: {e}")

def start_scheduler():
    print("RTDB Scheduler started. Fetch every "
          f"{FETCH_INTERVAL_MINUTES} min, sync every {SYNC_INTERVAL_MINUTES} min (24/7).")
    print("Daily Interest/Liquidation job scheduled at 00:00 KST.")

    # Initial loading
    refresh_held_stocks()
    fetch_job()
    sync_job()

    schedule.every(FETCH_INTERVAL_MINUTES).minutes.do(fetch_job)
    schedule.every(SYNC_INTERVAL_MINUTES).minutes.do(sync_job)
    
    # Schedule daily job at midnight KST
    schedule.every().day.at("00:00").do(process_daily_interest_and_liquidation)
    
    # Schedule held stocks refresh every 5 minutes
    schedule.every(5).minutes.do(refresh_held_stocks)
    
    # Schedule history job at 06:00 KST (after US market close)
    schedule.every().day.at("06:00").do(history_job)

    while True:
        schedule.run_pending()
        
        # Check AI requests more frequently (every 2 seconds)
        try:
            process_ai_requests()
        except Exception as e:
            print(f"Error in process_ai_requests: {e}")
            
        time.sleep(2)

import google.generativeai as genai

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is not set")
genai.configure(api_key=GEMINI_API_KEY)

def process_ai_requests():
    """
    Check RTDB for pending AI analysis requests and use Gemini API.
    path: ai_requests/{uid}
    """
    ref = rtdb_admin.reference('ai_requests')
    requests = ref.get()
    
    if not requests:
        return

    for uid, data in requests.items():
        if isinstance(data, dict) and data.get('status') == 'pending':
            print(f"[{now_kst()}] Processing AI request for user {uid}...")
            
            try:
                # 1. Fetch User Portfolio from Firestore
                portfolio_ref = firestore_db.collection("users").document(uid).collection("portfolio")
                portfolio_docs = portfolio_ref.stream()
                
                portfolio_text = []
                total_value = 0
                
                for doc in portfolio_docs:
                    item = doc.to_dict()
                    symbol = item.get('symbol')
                    quantity = item.get('quantity', 0)
                    
                    if quantity > 0:
                        stock_info = latest_snapshot.get(symbol)
                        current_price = stock_info.price if stock_info else 0
                        name = stock_info.name if stock_info else symbol
                        
                        value = quantity * current_price
                        total_value += value
                        portfolio_text.append(f"- {name} ({symbol}): {quantity}주 (평가액: {value:,.0f} KRW)")

                if not portfolio_text:
                    result_text = "보유한 주식이 없습니다. 포트폴리오를 구성한 뒤 다시 요청해주세요."
                else:
                    # 2. Fetch User Credit Info
                    credit_text = ""
                    try:
                        user_doc = firestore_db.collection("users").document(uid).get()
                        if user_doc.exists:
                            user_data = user_doc.to_dict()
                            used_credit = user_data.get('usedCredit', 0)
                            if used_credit > 0:
                                credit_limit = user_data.get('creditLimit', 0)
                                credit_text = (
                                    f"\n\n[추가 정보: 신용(레버리지) 사용 중]\n"
                                    f"- 사용 신용 금액: {used_credit:,.0f} KRW\n"
                                    f"- 신용 한도: {credit_limit:,.0f} KRW\n"
                                    "사용자가 빚을 내어 투자(신용 거래) 중이므로, 반대매매 위험성이나 이자 부담을 고려하여 "
                                    "리스크 관리에 대해 더 강력하고 구체적인 조언을 포함해줘."
                                )
                    except Exception as e:
                        print(f"Error fetching user credit info: {e}")

                    # 3. Construct Prompt
                    prompt = (
                        f"너는 주식 투자 게임의 AI 조언가야. 사용자의 현재 포트폴리오는 다음과 같아:\n\n"
                        f"{chr(10).join(portfolio_text)}\n\n"
                        f"총 평가액: {total_value:,.0f} KRW"
                        f"{credit_text}\n\n"
                        "이 포트폴리오에 대해 간단명료하게 분석해주고, 리스크 관리나 수익률 개선을 위한 구체적인 조언을 3~4문장으로 해줘. "
                        "말투는 친절하고 전문적으로 한국어로 해줘."
                    )
                    
                    # 3. Call Gemini API
                    # Using gemini-2.5-flash as it is available for this key
                    model = genai.GenerativeModel('gemini-2.5-flash')
                    response = model.generate_content(prompt)
                    result_text = response.text
            
            except Exception as e:
                print(f"Error processing AI request for {uid}: {e}")
                result_text = "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."

            # 4. Update RTDB
            ref.child(uid).update({
                'status': 'completed',
                'result': result_text,
                'completedAt': now_kst().isoformat()
            })
            print(f"[{now_kst()}] Completed AI request for user {uid}.")

def history_job(force: bool = False):
    """
    Fetch and store historical data for all tracked stocks.
    This runs once a day.
    """
    print("-" * 60)
    print(f"[{now_kst()}] Starting History Job...")
    
    # Ensure we have a list of stocks to process
    global latest_snapshot
    if not latest_snapshot:
        print("Latest snapshot empty. Fetching current stocks first...")
        fetch_job()
        
    stocks_to_process = list(latest_snapshot.keys())
    print(f"Fetching history for {len(stocks_to_process)} stocks...")
    
    history_ref = rtdb_admin.reference('stock_history')
    
    success_count = 0
    for i, symbol in enumerate(stocks_to_process):
        # Rate limit friendly logging
        if i % 10 == 0:
            print(f"Processing {i}/{len(stocks_to_process)}...")
            
        history_data = fetch_stock_history(symbol)
        if history_data:
            history_ref.child(symbol).set(history_data)
            success_count += 1
            
        # Small sleep to be nice to yfinance/upstream if needed? 
        # yfinance usually handles rate limits well, but let's be safe.
        time.sleep(0.5)
        
    print(f"[{now_kst()}] History Job Completed. Updated {success_count}/{len(stocks_to_process)} stocks.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stock updater scheduler for RTDB")
    parser.add_argument("--force", action="store_true",
                        help="Fetch and sync once immediately regardless of market hours, then exit.")
    parser.add_argument("--daily-job", action="store_true",
                        help="Run the daily interest/liquidation job immediately, then exit.")
    parser.add_argument("--daily-chart", action="store_true",
                        help="Run the history fetch job immediately, then exit.")
    args = parser.parse_args()

    if args.force:
        run_once_force()
    elif args.daily_job:
        run_daily_job_now()
    elif args.daily_chart:
        history_job()
    else:
        start_scheduler()

