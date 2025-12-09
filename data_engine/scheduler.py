import argparse
import schedule
import time
from datetime import datetime, time as dt_time
from zoneinfo import ZoneInfo
from typing import Dict, Optional

from fetcher import fetch_top_stocks, commit_stock_changes
from models import Stock

MARKET_TZ = ZoneInfo("Asia/Seoul")
MARKET_OPEN = dt_time(hour=9, minute=0)
MARKET_CLOSE = dt_time(hour=15, minute=30)
FETCH_INTERVAL_MINUTES = 3
SYNC_INTERVAL_MINUTES = 3
STOCK_LIMIT = 100

latest_snapshot: Dict[str, Stock] = {}
last_written_snapshot: Dict[str, Stock] = {}

def now_kst() -> datetime:
    return datetime.now(MARKET_TZ)

def is_market_open(current_time: Optional[datetime] = None) -> bool:
    current = current_time or now_kst()
    return MARKET_OPEN <= current.time() <= MARKET_CLOSE

def has_stock_changed(new: Stock, old: Stock) -> bool:
    return any((
        new.price != old.price,
        new.change != old.change,
        round(new.change_percent, 4) != round(old.change_percent, 4),
        new.name != old.name,
    ))

def fetch_job(force: bool = False):
    global latest_snapshot
    if not force and not is_market_open():
        print("Market closed - skipping fetch.")
        return
    latest_snapshot = fetch_top_stocks(limit=STOCK_LIMIT)

def sync_job(force: bool = False):
    global last_written_snapshot
    if not force and not is_market_open():
        print("Market closed - skipping Firestore sync.")
        return
    if not latest_snapshot:
        print("No latest snapshot available yet.")
        return

    changed: Dict[str, Stock] = {}
    for symbol, stock in latest_snapshot.items():
        prev = last_written_snapshot.get(symbol)
        if prev is None or has_stock_changed(stock, prev):
            changed[symbol] = stock

    to_delete = [symbol for symbol in last_written_snapshot.keys() if symbol not in latest_snapshot]

    if not changed and not to_delete:
        print("No stock changes detected for this sync window.")
        return

    commit_stock_changes(changed.values(), to_delete)
    last_written_snapshot = {symbol: stock for symbol, stock in latest_snapshot.items()}

def run_once_force():
    print("Force mode: fetching top stocks and syncing once.")
    fetch_job(force=True)
    sync_job(force=True)

def start_scheduler():
    print("Scheduler started. Fetch every "
          f"{FETCH_INTERVAL_MINUTES} min, sync every {SYNC_INTERVAL_MINUTES} min during market hours.")

    fetch_job()
    sync_job()

    schedule.every(FETCH_INTERVAL_MINUTES).minutes.do(fetch_job)
    schedule.every(SYNC_INTERVAL_MINUTES).minutes.do(sync_job)

    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stock updater scheduler")
    parser.add_argument("--force", action="store_true",
                        help="Fetch and sync once immediately regardless of market hours, then exit.")
    args = parser.parse_args()

    if args.force:
        run_once_force()
    else:
        start_scheduler()
