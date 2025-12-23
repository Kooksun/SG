import argparse
import schedule
import time
import os
from datetime import datetime, time as dt_time, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Optional
from firebase_admin import db as rtdb_admin
from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from fetcher import fetch_top_stocks, fetch_us_stocks, fetch_exchange_rate, fetch_single_stock, fetch_stock_history
from models import Stock
import firestore_client  # Initializes Firebase app
from firestore_client import db as firestore_db
from trade_executor import buy_stock, sell_stock
import mission_manager
from supabase_client import get_supabase
from dotenv import load_dotenv

# Load environment variables from .env file in the same directory
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

MARKET_TZ = ZoneInfo("Asia/Seoul")
FETCH_INTERVAL_MINUTES = 1
SYNC_INTERVAL_MINUTES = 1
STOCK_LIMIT = 500
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
        new.market != old.market,
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

import math
import numpy as np

def sanitize_for_firebase(data):
    """
    Recursively sanitize data to remove NaN and Infinite values,
    replacing them with 0 (or None) to make it JSON compliant for Firebase.
    """
    if isinstance(data, dict):
        return {k: sanitize_for_firebase(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_for_firebase(v) for v in data]
    elif isinstance(data, float):
        if math.isnan(data) or math.isinf(data):
            return 0.0
    elif isinstance(data, (np.generic, np.float64, np.float32)): # Handle numpy types explicitly if needed
        # Convert to python native type first
        val = data.item()
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
             return 0.0
        return val
    return data

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
            stock_dict = stock.to_dict()
            stock_dict['updatedAt'] = stock.updated_at.isoformat()
            updates[symbol] = stock_dict
        
        # Sanitize entire updates dict before sending to Firebase
        updates = sanitize_for_firebase(updates)
        
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
                data = doc.to_dict()
                qty = data.get('quantity', 0)
                if qty != 0:
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
                    
                    # Sanitize before set
                    stock_dict = sanitize_for_firebase(stock_dict)
                    
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
    query = users_ref.where(filter=FieldFilter("usedCredit", ">", 0))
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
            buy_txs = tx_ref.where(filter=FieldFilter("uid", "==", uid)).where(filter=FieldFilter("type", "==", "BUY")).order_by("timestamp", direction=firestore.Query.DESCENDING).limit(50).stream()
            
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
                net_price = current_price * 0.999 # 0.1% fee
                shares_needed = int(remaining_excess / net_price) + 1
                shares_to_sell = min(shares_needed, owned_qty)
                
                try:
                    print(f"  -> Selling {shares_to_sell} of {symbol} @ {current_price}")
                    proceeds = sell_stock(uid, symbol, stock_info.name, current_price, shares_to_sell)
                    
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
                    if qty == 0: continue
                    
                    stock_info = latest_snapshot.get(symbol)
                    if not stock_info: continue
                    
                    current_price = stock_info.price
                    remaining_excess = excess_credit - liquidated_amount

                    if qty > 0:
                        # Long position
                        net_price = current_price * 0.999 # 0.1% fee
                        shares_needed = int(remaining_excess / net_price) + 1
                        shares_to_sell = min(shares_needed, qty)
                        
                        try:
                            print(f"  -> [Fallback] Selling {shares_to_sell} of {symbol} @ {current_price}")
                            proceeds = sell_stock(uid, symbol, stock_info.name, current_price, shares_to_sell)
                            liquidated_amount += proceeds
                            count_liquidated += 1
                        except Exception as e:
                            print(f"  -> Failed to liquidate long {symbol}: {e}")
                    else:
                        # Short position (qty < 0)
                        abs_qty = abs(qty)
                        avg_sell_price = item.get("averagePrice", 0)
                        
                        # Covering releases original sell price from usedCredit
                        # But it costs current_price * shares to cover
                        # The net impact on 'usedCredit - credit_limit' (excess) is reduction by avg_sell_price per share?
                        # Actually the current liquidation check is 'used_credit > creditLimit'.
                        # used_credit decreases by avg_sell_price * shares.
                        shares_needed = int(remaining_excess / avg_sell_price) + 1
                        shares_to_cover = min(shares_needed, abs_qty)
                        
                        # Safety check: do we have enough balance to cover?
                        # If not, we might be stuck, but let's try.
                        try:
                            print(f"  -> [Fallback] Covering {shares_to_cover} of short {symbol} @ {current_price}")
                            buy_stock(uid, symbol, stock_info.name, current_price, shares_to_cover)
                            
                            # Release the margin from our local tracking
                            released = avg_sell_price * shares_to_cover
                            liquidated_amount += released
                            count_liquidated += 1
                        except Exception as e:
                            print(f"  -> Failed to liquidate short {symbol}: {e}")

    print(f"[{now_kst()}] Daily Job Completed. Interest applied to {count_interest} users. Liquidated trades: {count_liquidated}")

def process_missions_daily():
    print(f"[{now_kst()}] Starting Daily Mission Generation Job...")
    try:
        users_ref = firestore_db.collection("users")
        docs = users_ref.stream()
        count = 0
        for doc in docs:
            mission_manager.generate_daily_missions(doc.id)
            count += 1
        print(f"[{now_kst()}] Daily Mission Generation Completed for {count} users.")
    except Exception as e:
        print(f"Error generating daily missions: {e}")

def update_all_mission_progress():
    print(f"[{now_kst()}] Updating all users' mission progress...")
    try:
        users_ref = firestore_db.collection("users")
        docs = users_ref.stream()
        count = 0
        for doc in docs:
            mission_manager.update_mission_progress(doc.id)
            count += 1
        print(f"[{now_kst()}] Mission progress updated for {count} users.")
    except Exception as e:
        print(f"Error updating mission progress: {e}")

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
            data = doc.to_dict()
            qty = data.get('quantity', 0)
            if qty != 0:
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

        # 3. Load from RTDB custom_symbols
        try:
            custom_ref = rtdb_admin.reference('custom_symbols')
            custom_data = custom_ref.get()
            if custom_data and isinstance(custom_data, dict):
                for symbol, active in custom_data.items():
                    if active:
                        new_cache.add(symbol)
                print(f"[{now_kst()}] Loaded custom symbols from RTDB.")
        except Exception as e:
            print(f"Error loading custom symbols from RTDB: {e}")

        # 4. Fetch initial history for NEW symbols
        new_symbols = new_cache - held_stocks_cache
        if new_symbols:
            print(f"[{now_kst()}] New symbols detected: {new_symbols}. Fetching initial history...")
            for symbol in new_symbols:
                update_single_stock_history(symbol)

        held_stocks_cache = new_cache
        print(f"[{now_kst()}] Held stocks cache refreshed. Count: {len(held_stocks_cache)} (Held + Reserved)")
        print(f"DEBUG: Current Held Stocks Cache: {held_stocks_cache}")
    except Exception as e:
        print(f"Error refreshing held stocks: {e}")

def process_limit_orders():
    """
    Check Firestore for pending limit orders and execute them if conditions are met.
    """
    if not latest_snapshot:
        return

    print(f"[{now_kst()}] Checking pending limit orders...")
    try:
        orders_ref = firestore_db.collection("active_orders")
        pending_orders = orders_ref.where(filter=FieldFilter("status", "==", "PENDING")).stream()
        
        for order_doc in pending_orders:
            order_data = order_doc.to_dict()
            uid = order_data.get("uid")
            symbol = order_data.get("symbol")
            name = order_data.get("name", symbol)
            target_price = order_data.get("targetPrice")
            quantity = order_data.get("quantity")
            order_type = order_data.get("type") # BUY or SELL
            
            stock_info = latest_snapshot.get(symbol)
            if not stock_info:
                continue
                
            current_price = stock_info.price
            
            execute = False
            if order_type == "BUY" and current_price <= target_price:
                execute = True
            elif order_type == "SELL" and current_price >= target_price:
                execute = True
                
            if execute:
                try:
                    print(f"  -> Executing LIMIT {order_type} for user {uid}: {symbol} @ {current_price} (Target: {target_price})")
                    market = stock_info.market
                    if order_type == "BUY":
                        buy_stock(uid, symbol, name, current_price, quantity, order_type="LIMIT", market=market)
                    else:
                        sell_stock(uid, symbol, name, current_price, quantity, order_type="LIMIT", market=market)
                    
                    orders_ref.document(order_doc.id).update({
                        "status": "COMPLETED",
                        "executedPrice": current_price,
                        "executedAt": firestore.SERVER_TIMESTAMP
                    })
                except Exception as e:
                    print(f"  -> ERROR executing limit order {order_doc.id}: {e}")
                    orders_ref.document(order_doc.id).update({
                        "status": "FAILED",
                        "errorMessage": str(e)
                    })
    except Exception as e:
        print(f"Error in process_limit_orders: {e}")


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
    
    schedule.every(1).minutes.do(process_limit_orders)
    
    # Schedule missions
    schedule.every().day.at("00:00").do(process_missions_daily)
    schedule.every(1).minutes.do(update_all_mission_progress)

    # Schedule search requests processing every 5 seconds (not use schedule for high frequency)
    # Actually we'll call it in the loop
    
    # Schedule history job at 06:00 KST (after US market close)
    schedule.every().day.at("06:00").do(history_job)

    # Schedule ranking history every hour
    schedule.every().hour.at(":00").do(record_ranking_history)

    while True:
        schedule.run_pending()
        
        # Check AI requests and Limit Orders more frequently
        try:
            process_ai_requests()
            process_search_requests()
            process_history_requests()
        except Exception as e:
            print(f"Error in background processing: {e}")
            
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
            portfolio_signature = None
            
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
                    
                    if quantity != 0:
                        stock_info = latest_snapshot.get(symbol)
                        current_price = stock_info.price if stock_info else 0
                        name = stock_info.name if stock_info else symbol
                        
                        # Use Absolute valuation for total value calculation but indicate short in text
                        value = quantity * current_price
                        total_value += value # Net asset value
                        
                        pos_type = "매수" if quantity > 0 else "공매도"
                        portfolio_text.append(f"- {name} ({symbol}): {quantity}주 ({pos_type}, 평가액: {value:,.0f} KRW)")

                if not portfolio_text:
                    result_text = "보유한 주식이 없습니다. 포트폴리오를 구성한 뒤 다시 요청해주세요."
                else:
                    # 2. Fetch Detailed User Info for Context
                    user_info_text = ""
                    try:
                        user_doc = firestore_db.collection("users").document(uid).get()
                        if user_doc.exists:
                            user_data = user_doc.to_dict()
                            balance = user_data.get('balance', 0)
                            used_credit = user_data.get('usedCredit', 0)
                            credit_limit = user_data.get('creditLimit', 0)
                            
                            leverage_ratio = (used_credit / credit_limit * 100) if credit_limit > 0 else 0
                            
                            user_info_text = (
                                f"\n[사용자 자산 상태]\n"
                                f"- 현재 현금 잔고: {balance:,.0f} KRW\n"
                                f"- 사용 중인 신용/레버리지: {used_credit:,.0f} KRW (한도 대비 {leverage_ratio:.1f}% 사용)\n"
                                f"- 전체 신용 한도: {credit_limit:,.0f} KRW"
                            )
                    except Exception as e:
                        print(f"Error fetching user info for AI: {e}")

                    # 3. Construct Refined Prompt
                    prompt = (
                        f"너는 주식 투자 게임의 전문 AI 조언가야. 사용자의 현재 상황은 다음과 같아:\n\n"
                        f"[포트폴리오 구성]\n"
                        f"{chr(10).join(portfolio_text)}\n"
                        f"- 주식 총 평가액(Net): {total_value:,.0f} KRW\n"
                        f"{user_info_text}\n\n"
                        "위 데이터를 바탕으로 포트폴리오를 분석하고 다음 가이드라인에 따라 조언해줘:\n"
                        "1. **리스크 평가**: 신용 사용량(레버리지 비율)이 적절한지 판단해줘. (사용량이 한도 대비 매우 적으면 과도한 경고보다는 안정적이라고 평가해줘)\n"
                        "2. **공매도 분석**: 공매도(Short) 포지션이 있다면, 주가 상승 시 손실이 무한대일 수 있다는 점을 고려하여 적절한 리스크 관리를 조언해줘.\n"
                        "3. **수익성 및 분산**: 포트폴리오의 집중도나 종목 구성에 대해 전문적인 의견을 제시해줘.\n\n"
                        "답변은 3~4문장으로 간단명료하게, 친절하고 전문적인 한국어로 작성해줘."
                    )
                    
                    # 4. Call Gemini API
                    model = genai.GenerativeModel('gemini-3-pro-preview')
                    response = model.generate_content(prompt)
                    result_text = response.text

                    # 5. Generate Portfolio Signature for Change Detection
                    # Format: symbol:qty|symbol:qty (sorted)
                    items_for_sig = []
                    for doc in firestore_db.collection("users").document(uid).collection("portfolio").stream():
                        d = doc.to_dict()
                        items_for_sig.append(f"{d.get('symbol')}:{d.get('quantity')}")
                    items_for_sig.sort()
                    portfolio_signature = "|".join(items_for_sig)
            
            except Exception as e:
                print(f"Error processing AI request for {uid}: {e}")
                result_text = "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
                portfolio_signature = None

            # 6. Update RTDB
            update_payload = {
                'status': 'completed',
                'result': result_text,
                'completedAt': now_kst().isoformat()
            }
            if portfolio_signature:
                update_payload['portfolioSignature'] = portfolio_signature
                
            ref.child(uid).update(update_payload)
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
    
    success_count = 0
    for i, symbol in enumerate(stocks_to_process):
        # Rate limit friendly logging
        if i % 10 == 0:
            print(f"Processing {i}/{len(stocks_to_process)}...")
            
        if update_single_stock_history(symbol):
            success_count += 1
            
        # Small sleep to be nice to yfinance/upstream
        time.sleep(0.5)
        
    print(f"[{now_kst()}] History Job Completed. Updated {success_count}/{len(stocks_to_process)} stocks in Supabase.")

def update_single_stock_history(symbol: str) -> bool:
    """
    Fetch and store historical data for a single stock to Supabase.
    Returns True if success, False otherwise.
    """
    from supabase_client import get_supabase
    supabase = get_supabase()
    if not supabase:
        return False

    history_data = fetch_stock_history(symbol)
    if history_data:
        # Prepare rows for Supabase insertion
        rows = []
        for item in history_data:
            rows.append({
                "symbol": symbol,
                "time": item["time"],
                "open": item["open"],
                "high": item["high"],
                "low": item["low"],
                "close": item["close"],
                "volume": item.get("volume", 0)
            })
        
        try:
            # Upsert to prevent duplicate errors
            supabase.table("stock_history").upsert(rows, on_conflict="symbol,time").execute()
            return True
        except Exception as e:
            print(f"Error saving history for {symbol} to Supabase: {e}")
            return False
    return False

def process_search_requests():
    """
    Check RTDB for pending search requests.
    path: search_requests/{uid}
    """
    ref = rtdb_admin.reference('search_requests')
    requests = ref.get()
    
    if not requests:
        return

    # Cache for fdr listing to avoid redundant calls within one poll
    _cached_listing = None

    for uid, data in requests.items():
        if isinstance(data, dict) and data.get('status') == 'pending':
            query = data.get('query', '').strip()
            print(f"[{now_kst()}] Processing Search request for user {uid}: query='{query}'")
            
            try:
                results = []
                if query:
                    # 1. KR Stocks Search
                    if _cached_listing is None:
                        import FinanceDataReader as fdr
                        _cached_listing = fdr.StockListing('KRX')
                        _cached_listing['Code'] = _cached_listing['Code'].astype(str)
                    
                    # Filter by Symbol or Name
                    mask = (
                        _cached_listing['Code'].str.contains(query, case=False) |
                        _cached_listing['Name'].str.contains(query, case=False)
                    )
                    matches = _cached_listing[mask].sort_values(by='Marcap', ascending=False).head(15)
                    
                    for _, row in matches.iterrows():
                        results.append({
                            'symbol': row['Code'],
                            'name': row['Name'],
                            'market': row['Market'],
                            'type': 'KR'
                        })
                    
                    # 2. US Stocks Search (Simple match from US_TICKER_MAP)
                    from fetcher import US_TICKER_MAP
                    us_matches = []
                    for ticker, kor_name in US_TICKER_MAP.items():
                        if query.lower() in ticker.lower() or query in kor_name:
                            us_matches.append({
                                'symbol': ticker,
                                'name': kor_name,
                                'market': 'US',
                                'type': 'US'
                            })
                    
                    # Combine results, prioritizing US if explicitly searched by ticker
                    results = us_matches + results
                    results = results[:20] # Limit total results

                # Update Results and Status
                rtdb_admin.reference(f'search_results/{uid}').set({
                    'results': results,
                    'query': query,
                    'updatedAt': now_kst().isoformat()
                })
                ref.child(uid).update({
                    'status': 'completed',
                    'completedAt': now_kst().isoformat()
                })
                
            except Exception as e:
                print(f"Error processing Search request for {uid}: {e}")
                ref.child(uid).update({
                    'status': 'error',
                    'error': str(e)
                })

def record_ranking_history():
    """
    Calculate total assets for all users and record their rankings in Supabase.
    Run every hour.
    """
    print(f"[{now_kst()}] Recording ranking history...")
    if not latest_snapshot:
        print("Latest snapshot empty. Skipping ranking history.")
        return

    try:
        # 1. Fetch all users from Firestore
        users_ref = firestore_db.collection("users")
        users_docs = users_ref.stream()
        
        user_data_map = {}
        for doc in users_docs:
            data = doc.to_dict()
            user_data_map[doc.id] = {
                'balance': data.get('balance', 0),
                'usedCredit': data.get('usedCredit', 0),
                'portfolio_value': 0
            }
            
        # 2. Fetch all portfolios
        portfolios = firestore_db.collection_group("portfolio").stream()
        for doc in portfolios:
            # UID is the grandparent of the portfolio item document
            # Path: users/{uid}/portfolio/{symbol}
            uid = doc.reference.parent.parent.id
            if uid not in user_data_map:
                continue
            
            data = doc.to_dict()
            symbol = doc.id
            quantity = data.get('quantity', 0)
            
            if quantity != 0:
                stock_info = latest_snapshot.get(symbol)
                if stock_info:
                    user_data_map[uid]['portfolio_value'] += quantity * stock_info.price
        
        # 3. Calculate total assets and prepare for ranking
        ranking_list = []
        for uid, data in user_data_map.items():
            total_assets = data['balance'] + data['portfolio_value'] - data['usedCredit']
            ranking_list.append({
                'uid': uid,
                'total_assets': total_assets
            })
            
        # 4. Sort by total assets descending
        ranking_list.sort(key=lambda x: x['total_assets'], reverse=True)
        
        # 5. Assign ranks and prepare rows for Supabase
        rows = []
        recorded_at = now_kst().isoformat()
        for i, item in enumerate(ranking_list):
            rows.append({
                'uid': item['uid'],
                'total_assets': int(item['total_assets']),
                'rank': i + 1,
                'recorded_at': recorded_at
            })
            
        # 6. Insert into Supabase
        if rows:
            supabase = get_supabase()
            if supabase:
                supabase.table("user_ranking_history").insert(rows).execute()
                print(f"[{now_kst()}] Successfully recorded ranking history for {len(rows)} users.")
            else:
                print("Supabase client not available.")
                
    except Exception as e:
        print(f"Error in record_ranking_history: {e}")

def process_history_requests():
    """
    Check RTDB for pending history fetch requests.
    path: history_requests/{symbol}
    """
    ref = rtdb_admin.reference('history_requests')
    requests = ref.get()
    
    if not requests:
        return

    for symbol, data in requests.items():
        # data might be a boolean True or a dict with status
        status = 'pending'
        if isinstance(data, dict):
            status = data.get('status', 'pending')
        elif data == True:
            status = 'pending'
            
        if status == 'pending':
            print(f"[{now_kst()}] Processing History request for symbol: {symbol}")
            try:
                # Reuse the existing update_single_stock_history
                success = update_single_stock_history(symbol)
                if success:
                    ref.child(symbol).set({
                        'status': 'completed',
                        'updatedAt': now_kst().isoformat()
                    })
                else:
                    ref.child(symbol).update({
                        'status': 'error',
                        'error': 'Fetch returned no data or failed'
                    })
            except Exception as e:
                print(f"Error processing History request for {symbol}: {e}")
                ref.child(symbol).update({
                    'status': 'error',
                    'error': str(e)
                })

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

