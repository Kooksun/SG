import schedule
import time
from datetime import datetime, time as dt_time
from .firebase_config import main_db, kospi_db, kosdaq_db
from .fetcher import fetch_kr_stocks, fetch_exchange_rate, fetch_indices, MARKET_TZ
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
    """Compare price field to determine if an update is needed.
    Only sync to RTDB when price changes to save bandwidth.
    """
    if not old_dict: return True
    return new_dict.get('price') != old_dict.get('price')

def price_update_job():
    global last_snapshot
    now = datetime.now(MARKET_TZ)
    is_open = is_kr_market_open()
    print(f"[{now}] Processing Price Update (Market Open: {is_open})...")
    
    # 1. Fetch Latest Data
    try:
        kr_stocks = fetch_kr_stocks()
        
        # Merge all
        all_stocks = {**kr_stocks}
        
        exchange_rate = fetch_exchange_rate()
        indices = fetch_indices()
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    # 2. Prepare Updates (Diff check)
    updates_by_market = {
        'KOSPI': {},
        'KOSDAQ': {},
        'ETF': {}
    }
    
    for symbol, stock in all_stocks.items():
        new_dict = stock.to_dict() # Use full dict for snapshot comparison
        old_dict = last_snapshot.get(symbol)
        
        if has_stock_changed(new_dict, old_dict):
            # Group by market and use compressed format for RTDB
            m_type = stock.market if stock.market in updates_by_market else 'KOSPI'
            updates_by_market[m_type][symbol] = stock.to_rtdb_dict()
            
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
        
        # B. KOSPI Project: KOSPI + ETF
        if updates_by_market['KOSPI'] or updates_by_market['ETF'] or is_open:
            if updates_by_market['KOSPI']:
                kospi_db.child('stocks/KOSPI').update(sanitize_for_firebase(updates_by_market['KOSPI']))
            if updates_by_market['ETF']:
                kospi_db.child('stocks/ETF').update(sanitize_for_firebase(updates_by_market['ETF']))
            
            kospi_db.child('system/updatedAt').set(now.isoformat())
            
            total_kp = len(updates_by_market['KOSPI']) + len(updates_by_market['ETF'])
            if total_kp > 0:
                print(f"  -> KOSPI Project: Synced {total_kp} stock changes (KOSPI+ETF).")

        # C. KOSDAQ Project: KOSDAQ
        if updates_by_market['KOSDAQ'] or is_open:
            if updates_by_market['KOSDAQ']:
                kosdaq_db.child('stocks/KOSDAQ').update(sanitize_for_firebase(updates_by_market['KOSDAQ']))
            
            kosdaq_db.child('system/updatedAt').set(now.isoformat())
            if updates_by_market['KOSDAQ']:
                print(f"  -> KOSDAQ Project: Synced {len(updates_by_market['KOSDAQ'])} stock changes.")
                
    except Exception as e:
        print(f"Error during Firebase sync: {e}")

def run_scheduler():
    print("Season 3 Price Updater (Optimized) started.")
    
    # Track the current operational mode
    current_market_open = None
    
    def setup_schedule(immediate=False):
        nonlocal current_market_open
        is_open = is_kr_market_open()
        
        # If market just opened OR it's the initial call
        if current_market_open == False and is_open == True:
            print("!!! Market just opened. Triggering immediate update.")
            price_update_job()
        
        if current_market_open == is_open and not immediate:
            return # No change needed
            
        schedule.clear('price_job')
        interval = 30 if is_open else 60
        
        schedule.every(interval).seconds.do(price_update_job).tag('price_job')
        current_market_open = is_open
        print(f"Scheduler mode changed. Market Open: {is_open}, Interval: {interval}s")

    # Initial run and setup
    price_update_job()
    setup_schedule(immediate=True)
    
    # Check for schedule change every 10 seconds
    schedule.every(10).seconds.do(setup_schedule)
    
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    # python -m backend.price_updater
    run_scheduler()
