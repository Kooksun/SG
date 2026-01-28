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
from groq import Groq

from fetcher import fetch_top_stocks, fetch_us_stocks, fetch_exchange_rate, fetch_single_stock, fetch_stock_history, fetch_indices
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
STOCK_LIMIT = 100
DAILY_INTEREST_RATE = 0.001  # 0.1% per day

latest_snapshot: Dict[str, Stock] = {}
last_written_snapshot: Dict[str, Stock] = {}
latest_exchange_rate: float = 1400.0
latest_indices: Dict[str, Dict] = {}
held_stocks_cache: set[str] = set()
last_kr_fetch_time: Optional[datetime] = None
last_us_fetch_time: Optional[datetime] = None
last_indices_fetch_time: Optional[datetime] = None

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

def is_kr_market_open() -> bool:
    now = now_kst()
    # Mon-Fri (0-4)
    if now.weekday() >= 5:
        return False
    return dt_time(9, 0) <= now.time() <= dt_time(15, 30)

def is_us_market_open() -> bool:
    now = now_kst()
    # US Market: 23:30 - 06:00 KST (Approximately Mon night - Fri night in NY)
    # This covers Mon 23:30 -> Tue 06:00, ..., Fri 23:30 -> Sat 06:00
    t = now.time()
    weekday = now.weekday()
    
    # Mon night to Fri night
    if weekday <= 4: # Mon - Fri
        if t >= dt_time(23, 30): return True
    
    # Tue morning to Sat morning
    if 1 <= weekday <= 5: # Tue - Sat
        if t <= dt_time(6, 0): return True
        
    return False

def fetch_job(force: bool = False):
    global latest_snapshot, latest_exchange_rate, latest_indices
    global last_kr_fetch_time, last_us_fetch_time, last_indices_fetch_time
    
    now = now_kst()
    print("-" * 60)
    print(f"[{now}] Starting fetch job cycle...")
    
    kr_stocks = {}
    us_stocks = {}
    
    # 1. KR Stocks Fetch Logic
    should_fetch_kr = force or is_kr_market_open()
    if not should_fetch_kr:
        # Check if 1 hour has passed since last fetch
        if last_kr_fetch_time is None or (now - last_kr_fetch_time) >= timedelta(hours=1):
            should_fetch_kr = True
            
    if should_fetch_kr:
        print(f"[{now}] Fetching KR stocks (Market Open: {is_kr_market_open()})...")
        # Fetch Top 100/100 (ETFs are already filtered out in fetcher side)
        kr_stocks = fetch_top_stocks(limit=STOCK_LIMIT)
        
        # --- Mandatory/Existing Symbol Coverage ---
        # Collect all symbols that MUST be updated
        mandatory_symbols = set(held_stocks_cache)
        
        # Add existing RTDB symbols to ensure they are updated if present
        try:
            existing_stocks = rtdb_admin.reference('stocks').get() or {}
            # Only include KR stocks (approx 6-digit numeric symbol)
            for s in existing_stocks:
                if s.isdigit():
                    mandatory_symbols.add(s)
        except Exception as e:
            print(f"Error fetching existing RTDB symbols: {e}")
            
        # Identify missing symbols from the top fetch
        missing_kr = mandatory_symbols - set(kr_stocks.keys())
        if missing_kr:
            print(f"[{now}] Fetching {len(missing_kr)} additional/existing KR stocks individually...")
            for symbol in missing_kr:
                st = fetch_single_stock(symbol)
                if st:
                    kr_stocks[symbol] = st
        
        last_kr_fetch_time = now
    else:
        # Reuse existing KR stocks from latest_snapshot
        kr_stocks = {s: st for s, st in latest_snapshot.items() if st.currency == 'KRW'}
        # print(f"[{now}] Skipping KR fetch (off-hours). Reusing {len(kr_stocks)} stocks.")

    # 2. US Stocks Fetch Logic
    should_fetch_us = force or is_us_market_open()
    if not should_fetch_us:
        if last_us_fetch_time is None or (now - last_us_fetch_time) >= timedelta(hours=1):
            should_fetch_us = True
            
    if should_fetch_us:
        print(f"[{now}] Fetching US stocks (Market Open: {is_us_market_open()})...")
        us_stocks = fetch_us_stocks()
        
        # --- Mandatory/Existing Symbol Coverage for US ---
        # Identify US symbols (heuristically those with letters) in the held cache
        held_us_symbols = {s for s in held_stocks_cache if any(c.isalpha() for c in s)}
        
        # Identify missing symbols from the popular fetch
        missing_us = held_us_symbols - set(us_stocks.keys())
        if missing_us:
            print(f"[{now}] Fetching {len(missing_us)} additional held US stocks individually...")
            for symbol in missing_us:
                st = fetch_single_stock(symbol)
                if st:
                    us_stocks[symbol] = st
        
        last_us_fetch_time = now
    else:
        us_stocks = {s: st for s, st in latest_snapshot.items() if st.currency == 'USD'}
        # print(f"[{now}] Skipping US fetch (off-hours). Reusing {len(us_stocks)} stocks.")

    # 3. Exchange Rate & Indices (Following KR fetch cycle or 1 hour)
    should_fetch_indices = force or should_fetch_kr
    if should_fetch_indices:
        rate = fetch_exchange_rate()
        if rate:
            latest_exchange_rate = rate
            
        indices = fetch_indices()
        if indices:
            latest_indices = indices
        last_indices_fetch_time = now

    # Merge
    all_stocks = {**kr_stocks, **us_stocks}

    # Filter out stocks with price 0
    latest_snapshot = {s: stock for s, stock in all_stocks.items() if stock.price > 0}
    
    print(f"[{now}] Total snapshot: {len(latest_snapshot)}. KR: {len(kr_stocks)}, US: {len(us_stocks)}. Rate: {latest_exchange_rate}")

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
        print(f"[{now_kst()}] No latest snapshot available yet. Skipping sync.")
        return

    print(f"[{now_kst()}] Starting sync_job...")
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
        # Update specific stocks timestamp
        rtdb_admin.reference('system/stocksUpdatedAt').set(now_kst().isoformat())
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

    # Sync Indices
    if latest_indices:
        rtdb_admin.reference('system/indices').set(latest_indices)
        rtdb_admin.reference('system/indicesUpdatedAt').set(now_kst().isoformat())
        print(f"[{now_kst()}] Synced Market Indices.")

    # Global Last Updated At
    rtdb_admin.reference('system/updatedAt').set(now_kst().isoformat())

    last_written_snapshot = {symbol: stock for symbol, stock in latest_snapshot.items()}
    print(f"[{now_kst()}] Completed sync_job.")

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
                if stock_info.currency == "USD":
                    current_price *= latest_exchange_rate

                owned_qty = portfolio_map[symbol].get("quantity", 0)
                
                if owned_qty <= 0:
                    continue
                
                # Calculate how much to sell
                remaining_excess = excess_credit - liquidated_amount
                net_price = current_price * 0.999 # 0.1% fee
                shares_needed = int(remaining_excess / net_price) + 1
                shares_to_sell = min(shares_needed, owned_qty)
                
                try:
                    print(f"  -> Selling {shares_to_sell} of {symbol} @ {current_price} (KRW converted if US)")
                    proceeds = sell_stock(uid, symbol, stock_info.name, current_price, shares_to_sell, market=stock_info.market, original_price=stock_info.price, original_currency=stock_info.currency)
                    
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
                    
                    if qty > 0:
                        # Long position
                        current_price = stock_info.price
                        if stock_info.currency == "USD":
                            current_price *= latest_exchange_rate
                        
                        net_price = current_price * 0.999 # 0.1% fee
                        shares_needed = int(remaining_excess / net_price) + 1
                        shares_to_sell = min(shares_needed, qty)
                        
                        try:
                            print(f"  -> [Fallback] Selling {shares_to_sell} of {symbol} @ {current_price} (KRW converted if US)")
                            proceeds = sell_stock(uid, symbol, stock_info.name, current_price, shares_to_sell, market=stock_info.market, original_price=stock_info.price, original_currency=stock_info.currency)
                            liquidated_amount += proceeds
                            count_liquidated += 1
                        except Exception as e:
                            print(f"  -> Failed to liquidate long {symbol}: {e}")
                    else:
                        # Short position (qty < 0)
                        abs_qty = abs(qty)
                        avg_sell_price = item.get("averagePrice", 0)
                        
                        current_price = stock_info.price
                        if stock_info.currency == "USD":
                            current_price *= latest_exchange_rate

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
                            print(f"  -> [Fallback] Covering {shares_to_cover} of short {symbol} @ {current_price} (KRW converted if US)")
                            buy_stock(uid, symbol, stock_info.name, current_price, shares_to_cover, market=stock_info.market, original_price=stock_info.price, original_currency=stock_info.currency)
                            
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
    """
    Optimized: Only update missions for users who had a transaction since their last mission update.
    Tracks activity via RTDB user_activities/{uid}.
    """
    # print(f"[{now_kst()}] Checking users for mission updates...")
    try:
        activities_ref = rtdb_admin.reference('user_activities')
        activities = activities_ref.get()
        
        if not activities:
            # print(f"[{now_kst()}] No active users found in RTDB activities.")
            return

        count = 0
        for uid, activity in activities.items():
            if not isinstance(activity, dict): continue
            
            last_tx = activity.get('lastTransactionAt')
            last_update = activity.get('lastMissionUpdateAt')
            
            # If there's a transaction after the last update, or if never updated
            if last_tx and (not last_update or last_tx > last_update):
                mission_manager.update_mission_progress(uid)
                activities_ref.child(uid).update({
                    'lastMissionUpdateAt': datetime.utcnow().isoformat() + "Z"
                })
                count += 1
        
        if count > 0:
            print(f"[{now_kst()}] Mission progress updated for {count} active users.")
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
            currency = order_data.get("currency", "KRW")
            
            stock_info = latest_snapshot.get(symbol)
            if not stock_info:
                continue
                
            current_price = stock_info.price
            
            # Comparison logic: Ensure we compare in the same currency
            # If the order is in KRW but the stock is USD, convert current_price for comparison
            compare_price = current_price
            if currency == "KRW" and stock_info.currency == "USD":
                compare_price = current_price * latest_exchange_rate
            
            execute = False
            if order_type == "BUY" and compare_price <= target_price:
                execute = True
            elif order_type == "SELL" and compare_price >= target_price:
                execute = True
                
            if execute:
                try:
                    print(f"  -> Executing LIMIT {order_type} for user {uid}: {symbol} @ {current_price} {stock_info.currency} (Target: {target_price} {currency})")
                    market = stock_info.market
                    
                    # Convert to KRW for the executor which expects base currency (KRW)
                    # Note: buy_stock/sell_stock logic in trade_executor.py uses the passed price as the actual KRW cost basis.
                    exec_price = current_price
                    if stock_info.currency == "USD":
                        exec_price = math.floor(current_price * latest_exchange_rate)
                    
                    if order_type == "BUY":
                        buy_stock(uid, symbol, name, exec_price, quantity, order_type="LIMIT", market=market, original_price=current_price, original_currency=stock_info.currency)
                    else:
                        sell_stock(uid, symbol, name, exec_price, quantity, order_type="LIMIT", market=market, original_price=current_price, original_currency=stock_info.currency)
                    
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

    # Schedule search requests processing every 5 seconds (not use schedule for high frequency)
    # Actually we'll call it in the loop
    
    # Schedule history job at 06:00 KST (after US market close)
    schedule.every().day.at("06:00").do(history_job)

    # Schedule ranking history every hour
    schedule.every().hour.at(":00").do(record_ranking_history)

    while True:
        schedule.run_pending()
        
        # Check AI requests, Search, and Mission progress more frequently
        try:
            process_ai_requests()
            process_search_requests()
            process_history_requests()
            update_all_mission_progress()
        except Exception as e:
            print(f"Error in background processing: {e}")
            
        time.sleep(2)

import google.generativeai as genai

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is not set")
genai.configure(api_key=GEMINI_API_KEY)

# Configure Groq API
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client = None
if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)

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
            # 0. Immediate Lock: Set status to processing to avoid double execution
            try:
                ref.child(uid).update({'status': 'processing'})
            except Exception as lock_e:
                print(f"Error locking request for {uid}: {lock_e}")
                continue
            
            print(f"[{now_kst()}] Processing AI request for user {uid}...")
            
            # Initialize response variables
            result_text = "AI 분석 요청을 처리하는 중입니다."
            used_model = "n/a"
            last_error = None
            portfolio_signature = None
            
            try:
                # 1. Fetch User Portfolio from Firestore
                portfolio_ref = firestore_db.collection("users").document(uid).collection("portfolio")
                portfolio_docs = list(portfolio_ref.stream()) # Listify to use multiple times if needed
                
                portfolio_text = []
                total_value = 0
                total_principal = 0
                total_profit = 0
                
                for doc in portfolio_docs:
                    item = doc.to_dict()
                    symbol = item.get('symbol')
                    quantity = item.get('quantity', 0)
                    avg_price = item.get('averagePrice') or 0 # Handle None case
                    
                    if quantity != 0:
                        stock_info = latest_snapshot.get(symbol)
                        current_price = stock_info.price if stock_info else 0
                        name = stock_info.name if stock_info else symbol
                        
                        # Handle USD conversion
                        if stock_info and stock_info.currency == 'USD':
                            current_price *= latest_exchange_rate
                        
                        # Use Absolute valuation for total value calculation but indicate short in text
                        value = quantity * current_price
                        total_value += value # Net asset value
                        
                        pos_type = "매수" if quantity > 0 else "공매도"
                        portfolio_text.append(f"- {name} ({symbol}): {quantity}주 ({pos_type}, 평가액: {value:,.0f} KRW)")
                        
                        # Performance calculations
                        principal = abs(quantity) * avg_price
                        total_principal += principal
                        
                        if quantity > 0:
                            profit = (current_price - avg_price) * quantity
                        else:
                            profit = (avg_price - current_price) * abs(quantity)
                        total_profit += profit

                profit_ratio = (total_profit / total_principal * 100) if total_principal > 0 else 0

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
                        """
                        너는 개인 투자자를 위한 AI 리서치 애널리스트다.
                        단순 정보 요약이 아닌, 현재 포트폴리오의 성격과 전략적 의미를 해석하는 데 집중하라.
                        증권사 리포트 톤으로 중립적으로 작성하되, 분석적 깊이를 유지하라.
                        특정 투자 성향을 단정하지 말고, 가능한 전략 시나리오를 병렬적으로 제시하라.
                        명령형 표현이나 직접적인 매수/매도 권유는 사용하지 않는다.

                        아래 정보를 바탕으로 포트폴리오 분석 보고서를 작성하라.
                        """ + 
                        f"[포트폴리오 구성]\n"
                        f"{chr(10).join(portfolio_text)}\n\n"
                        f"[포트폴리오 성과]\n"
                        f"- 총 투자원금: {total_principal:,.0f} KRW\n"
                        f"- 총 평가손익: {total_profit:,.0f} KRW ({profit_ratio:+.2f}%)\n"
                        f"- 주식 총 평가액(Net): {total_value:,.0f} KRW\n"
                        f"{user_info_text}\n\n"
                        +
                        """
                        [출력 형식 요구사항]
                        - 전체 분량은 약 500~700자 이내
                        - 아래 4개 섹션을 반드시 포함하라
                        - 각 섹션마다 “해석 또는 판단” 문장을 최소 1개 이상 포함하라

                        1. Executive Summary
                           - 현재 포트폴리오의 성격(예: 테스트/대기/부분적 베팅)을 규정하고 요약

                        2. Portfolio Structure & Performance
                           - 자산 배분 구조와 성과를 해석 중심으로 서술
                           - 단순 수치 나열 금지

                        3. Risk, Exposure & Optionality
                           - 현재 구조가 노출하고 있는 리스크
                           - 동시에 확보하고 있는 선택지를 함께 서술

                        4. Scenario-based View
                           - 보수적 운용 시나리오
                           - 공격적 운용 시나리오
                           - 두 시나리오의 전제 조건을 함께 제시
                        """
                    )
                    
                    # 4. Generate Content (Primary: Groq, Secondary: Gemini)
                    used_model = "openai/gpt-oss-120b"
                    #print(prompt) # Reduced noise

                    if groq_client:
                        try:
                            completion = groq_client.chat.completions.create(
                                model=used_model,
                                messages=[                                    
                                    {"role": "user", "content": prompt}
                                ],
                                max_tokens=8192,
                                timeout=20.0, # 20 second timeout for Groq
                            )
                            result_text = completion.choices[0].message.content
                        except Exception as ge:
                            print(f"  -> Groq failed or quota exceeded: {ge}. Falling back to Gemini.")
                            try:
                                # Failover to Gemini
                                used_model = "gemini-3-pro-preview"
                                model = genai.GenerativeModel(used_model)
                                response = model.generate_content(prompt, request_options={'timeout': 20}) # 20 second timeout
                                result_text = response.text
                            except Exception as gemini_e:
                                print(f"  -> Gemini Analysis failed: {gemini_e}")
                                result_text = "AI 분석 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
                                last_error = gemini_e
                    print(f"  -> Analysis completed using {used_model}")

                    # 5. Generate Portfolio Signature for Change Detection
                    # Format: symbol:qty|symbol:qty (sorted)
                    items_for_sig = []
                    for doc in portfolio_docs:
                        d = doc.to_dict()
                        items_for_sig.append(f"{d.get('symbol')}:{d.get('quantity')}")
                    items_for_sig.sort()
                    portfolio_signature = "|".join(items_for_sig)
            
            except Exception as e:
                print(f"Error processing AI request for {uid}: {e}")
                result_text = "AI 분석 데이터 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
                last_error = e
                portfolio_signature = None

            # 6. Update RTDB
            update_payload = {
                'status': 'completed',
                'result': result_text,
                'completedAt': now_kst().isoformat(),
                'usedModel': used_model,
                'lastError': last_error
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
    success, _ = update_single_stock_history_v2(symbol)
    return success

def update_single_stock_history_v2(symbol: str) -> (bool, str):
    """
    Fetch and store historical data for a single stock to Supabase.
    Returns (True, "") if success, (False, "error message") otherwise.
    """
    from supabase_client import get_supabase
    supabase = get_supabase()
    if not supabase:
        msg = "Supabase client not initialized. Check SUPABASE_URL/KEY."
        print(f"Error for {symbol}: {msg}")
        return False, msg

    try:
        history_data = fetch_stock_history(symbol)
        if not history_data:
            msg = f"Naver returned no data for {symbol}."
            print(f"Error for {symbol}: {msg}")
            return False, msg
            
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
        
        # Upsert to prevent duplicate errors
        supabase.table("stock_history").upsert(rows, on_conflict="symbol,time").execute()
        print(f"Successfully updated history for {symbol} ({len(rows)} rows).")
        return True, ""
    except Exception as e:
        msg = f"Exception during history update for {symbol}: {str(e)}"
        print(msg)
        return False, msg

def process_search_requests():
    """
    Check RTDB for pending search requests.
    path: search_requests/{uid}
    """
    ref = rtdb_admin.reference('search_requests')
    requests = ref.get()
    
    if not requests:
        return

    for uid, data in requests.items():
        if isinstance(data, dict) and data.get('status') == 'pending':
            query = data.get('query', '').strip()
            print(f"[{now_kst()}] Processing Search request for user {uid}: query='{query}'")
            
            try:
                import requests as py_requests
                results = []
                if query:
                    # Naver Unified Search API (Stock target)
                    url = f"https://ac.stock.naver.com/ac?q={query}&target=stock"
                    headers = {"User-Agent": "Mozilla/5.0"}
                    
                    resp = py_requests.get(url, headers=headers, timeout=5)
                    if resp.status_code == 200:
                        search_data = resp.json()
                        items = search_data.get('items', [])
                        
                        # Naver returns a list of result objects
                        for item in items:
                            # Map Naver fields to our internal format
                            # KR: typeCode (KOSPI/KOSDAQ), nationCode (KOR)
                            # US: typeCode (NASDAQ/NYSE/AMEX), nationCode (USA)
                            nation = item.get('nationCode', 'KOR')
                            market_type = 'KR' if nation == 'KOR' else 'US'
                            
                            results.append({
                                'symbol': item.get('code'),
                                'name': item.get('name'),
                                'market': item.get('typeCode'),
                                'type': market_type
                            })
                    else:
                        print(f"Warning: Naver search API returned HTTP {resp.status_code}")

                # Update Results and Status
                rtdb_admin.reference(f'search_results/{uid}').set({
                    'results': results[:20], # UI limit
                    'query': query,
                    'updatedAt': now_kst().isoformat()
                })
                ref.child(uid).update({
                    'status': 'completed',
                    'completedAt': now_kst().isoformat()
                })
                print(f"[{now_kst()}] Completed Search request for user {uid}: found {len(results)} items.")
                
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
                'portfolio_value': 0,
                'short_initial_value': 0
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
                    # Handle USD conversion
                    current_price = stock_info.price
                    if stock_info.currency == 'USD':
                        current_price *= latest_exchange_rate
                        
                    user_data_map[uid]['portfolio_value'] += quantity * current_price
                    
                    if quantity < 0:
                        # Use absolute value of quantity * averagePrice for short initial value (margin)
                        # averagePrice is stored in KRW in this app
                        avg_price = data.get('averagePrice', 0)
                        user_data_map[uid]['short_initial_value'] += abs(quantity) * avg_price
        
        # 3. Calculate total assets (Equity) and prepare for ranking
        ranking_list = []
        batch = firestore_db.batch()
        
        for uid, data in user_data_map.items():
            # Corrected Equity Formula:
            # Equity = Cash + LongValue - CurrentShortValue - LongDebt
            # Cash = balance + short_initial_value (since proceeds are held)
            # LongDebt = usedCredit - short_initial_value
            # Equity = (balance + short_initial_value) + portfolio_value - (usedCredit - short_initial_value)
            # where portfolio_value = LongValue - CurrentShortValue
            equity = data['balance'] + data['portfolio_value'] - (data['usedCredit'] - data['short_initial_value']) + data['short_initial_value']
            
            # Update Firestore totalAssetValue for real-time consistency
            user_ref = firestore_db.collection("users").document(uid)
            batch.update(user_ref, {"totalAssetValue": int(equity)})
            
            ranking_list.append({
                'uid': uid,
                'equity': equity
            })
            
        # Execute Firestore batch update
        try:
            batch.commit()
            print(f"[{now_kst()}] Updated totalAssetValue for {len(user_data_map)} users in Firestore.")
        except Exception as e:
            print(f"Error committing totalAssetValue batch: {e}")
            
        # 4. Sort by equity descending
        ranking_list.sort(key=lambda x: x['equity'], reverse=True)
        
        # 1. Fetch user comments from RTDB
        user_comments = {}
        try:
            comments_data = rtdb_admin.reference('users').get() or {}
            for uid, data in comments_data.items():
                if isinstance(data, dict) and 'comment' in data:
                    user_comments[uid] = data['comment']
        except Exception as e:
            print(f"Error fetching user comments for ranking history: {e}")
            
        # 2. Assign ranks and prepare rows for Supabase
        rows = []
        recorded_at = now_kst().isoformat()
        for i, item in enumerate(ranking_list):
            uid = item['uid']
            rows.append({
                'uid': uid,
                'total_assets': int(item['equity']),
                'rank': i + 1,
                'recorded_at': recorded_at,
                'comment': user_comments.get(uid, "")
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
                success, error_msg = update_single_stock_history_v2(symbol)
                if success:
                    ref.child(symbol).set({
                        'status': 'completed',
                        'updatedAt': now_kst().isoformat()
                    })
                    print(f"[{now_kst()}] Completed History request for: {symbol}")
                else:
                    ref.child(symbol).update({
                        'status': 'error',
                        'error': error_msg or 'Fetch returned no data or failed'
                    })
                    print(f"[{now_kst()}] Failed History request for {symbol}: {error_msg}")
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

