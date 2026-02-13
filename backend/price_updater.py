import schedule
import time
from datetime import datetime, time as dt_time
from .firebase_config import main_db, kospi_db, kosdaq_db
from .fetcher import fetch_kr_stocks, fetch_etf_stocks, fetch_exchange_rate, fetch_indices, fetch_custom_stocks, MARKET_TZ
from .models import Stock
import math

# Global state for diff-based updates
last_snapshot: dict[str, dict] = {}

def sanitize_for_firebase(data):
    if isinstance(data, dict):
        return {k: sanitize_for_firebase(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_for_firebase(v) for v in data]
    elif isinstance(data, float):
        if math.isnan(data) or math.isinf(data): return 0.0
    return data

def is_kr_market_open() -> bool:
    """Check if the KR market is open (9:00 - 15:30, Weekdays)."""
    now = datetime.now(MARKET_TZ)
    if now.weekday() >= 5: # Sat, Sun
        return False
    return dt_time(9, 0) <= now.time() <= dt_time(15, 30)

def has_stock_changed(new_dict: dict, old_dict: dict) -> bool:
    """Compare key fields to determine if an update is needed."""
    if not old_dict: return True
    # Compare core price fields
    for field in ['price', 'change', 'change_percent', 'volume']:
        if new_dict.get(field) != old_dict.get(field):
            return True
    return False

def price_update_job():
    global last_snapshot
    now = datetime.now(MARKET_TZ)
    is_open = is_kr_market_open()
    print(f"[{now}] Processing Price Update (Market Open: {is_open})...")
    
    # 1. Fetch Latest Data
    try:
        kr_stocks = fetch_kr_stocks(kospi_limit=500, kosdaq_limit=700)
        etf_stocks = fetch_etf_stocks(limit=200)
        
        # 1-B. Fetch Custom Stocks from RTDB
        custom_info = main_db.child('system/custom_stocks').get() or {}
        custom_symbols = list(custom_info.keys())
        
        custom_stocks = {}
        if custom_symbols:
            # Chunk into batches of 50
            for i in range(0, len(custom_symbols), 50):
                batch = custom_symbols[i:i + 50]
                batch_data = fetch_custom_stocks(batch)
                
                # Assign market from API (most reliable)
                for sym, stock in batch_data.items():
                    info = custom_info.get(sym, {})
                    api_market = stock.market
                    saved_market = info.get('market')
                    
                    if api_market != saved_market:
                        # Update metadata in RTDB if it was wrong or missing
                        main_db.child('system/custom_stocks').child(sym).update({
                            'market': api_market
                        })
                        print(f"  [FIX] Market for {sym} corrected: {saved_market} -> {api_market}")
                
                custom_stocks.update(batch_data)
            print(f"  -> Processed {len(custom_stocks)} custom stocks.")

        # Merge all
        all_stocks = {**kr_stocks, **etf_stocks, **custom_stocks}
        
        exchange_rate = fetch_exchange_rate()
        indices = fetch_indices()
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    # 2. Prepare Updates (Diff check)
    kospi_updates = {}
    kosdaq_updates = {}
    
    for symbol, stock in all_stocks.items():
        new_dict = stock.to_dict()
        old_dict = last_snapshot.get(symbol)
        
        if has_stock_changed(new_dict, old_dict):
            # Format update
            if stock.market in ['KOSPI', 'ETF']:
                kospi_updates[symbol] = new_dict
            elif stock.market == 'KOSDAQ':
                kosdaq_updates[symbol] = new_dict
            
            # Update local snapshot
            last_snapshot[symbol] = new_dict

    # 3. Apply Updates to Firebase
    try:
        # A. Main Project: Indices, Exchange Rate, and System Status
        main_db.child('system').update(sanitize_for_firebase({
            'updatedAt': now.isoformat(),
            'exchange_rate': exchange_rate,
            'indices': indices,
            'market_open': is_open
        }))
        
        # B. KOSPI Project: Stocks + updatedAt
        if kospi_updates or is_open: # Keep updatedAt fresh during market hours
            if kospi_updates:
                kospi_db.child('stocks').update(sanitize_for_firebase(kospi_updates))
            kospi_db.child('system/updatedAt').set(now.isoformat())
            if kospi_updates:
                print(f"  -> KOSPI: Synced {len(kospi_updates)} stock changes.")

        # C. KOSDAQ Project: Stocks + updatedAt
        if kosdaq_updates or is_open:
            if kosdaq_updates:
                kosdaq_db.child('stocks').update(sanitize_for_firebase(kosdaq_updates))
            kosdaq_db.child('system/updatedAt').set(now.isoformat())
            if kosdaq_updates:
                print(f"  -> KOSDAQ: Synced {len(kosdaq_updates)} stock changes.")
                
    except Exception as e:
        print(f"Error during Firebase sync: {e}")

def run_scheduler():
    print("Season 3 Price Updater (Optimized) started.")
    
    # Track the current operational mode
    current_market_open = None
    
    def setup_schedule():
        nonlocal current_market_open
        is_open = is_kr_market_open()
        
        if current_market_open == is_open:
            return # No change needed
            
        schedule.clear('price_job')
        interval = 30 if is_open else 60
        
        schedule.every(interval).seconds.do(price_update_job).tag('price_job')
        current_market_open = is_open
        print(f"Scheduler mode changed. Market Open: {is_open}, Interval: {interval}s")

    # Initial run and setup
    price_update_job()
    setup_schedule()
    
    # Check for schedule change every 10 seconds
    schedule.every(10).seconds.do(setup_schedule)
    
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    # python -m backend.price_updater
    run_scheduler()
