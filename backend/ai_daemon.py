import schedule
import time
from datetime import datetime
from .ai_bot_manager import run_all_bots
from .price_updater import is_kr_market_open
from .fetcher import MARKET_TZ

def bot_job():
    if not is_kr_market_open():
        print(f"[{datetime.now(MARKET_TZ)}] Market is closed. Skipping AI bot moves.")
        return
    
    print(f"[{datetime.now(MARKET_TZ)}] Starting AI bot move cycle...")
    try:
        run_all_bots()
    except Exception as e:
        print(f"Error in AI bot move cycle: {e}")
    print(f"[{datetime.now(MARKET_TZ)}] AI bot move cycle completed.")

def run_daemon():
    print("Season 3 AI Bot Daemon started.")
    
    # Run once at start if market is open
    bot_job()
    
    # Schedule every 20 minutes
    schedule.every(20).minutes.do(bot_job)
    
    while True:
        try:
            schedule.run_pending()
        except Exception as e:
            print(f"Schedule execution error: {e}")
        time.sleep(1)

if __name__ == "__main__":
    # python -m backend.ai_daemon
    run_daemon()
