import time
import schedule
from datetime import datetime
from threading import Thread
from .firebase_config import main_db
from .fetcher import fetch_stock_chart, MARKET_TZ

def process_chart_request(symbol: str, request_data: dict):
    """Fetches chart data from Naver, compresses it, and uploads to RTDB."""
    if request_data.get('status') != 'PENDING':
        return

    print(f"  -> Chart Request: {symbol}")
    
    # 1. Update status to PROCESSING
    main_db.child(f'system/requests/chart/{symbol}').update({
        'status': 'PROCESSING',
        'processedAt': datetime.now(MARKET_TZ).isoformat()
    })

    # 2. Fetch Data (page 1 - recent 60 sessions)
    # We can expand this to fetch more pages if needed in the future
    compressed_data = fetch_stock_chart(symbol, page_size=60, page=1)
    
    if compressed_data:
        # 3. Upload to Data path
        main_db.child(f'system/data/chart/{symbol}').set({
            'data': compressed_data,
            'updatedAt': datetime.now(MARKET_TZ).isoformat()
        })
        
        # 4. Update status to COMPLETED
        main_db.child(f'system/requests/chart/{symbol}').update({
            'status': 'COMPLETED',
            'completedAt': datetime.now(MARKET_TZ).isoformat()
        })
        print(f"     SUCCESS: Uploaded {len(compressed_data)} points for {symbol}")
    else:
        # 4. Update status to FAILED
        main_db.child(f'system/requests/chart/{symbol}').update({
            'status': 'FAILED',
            'errorMessage': 'Failed to fetch data from Naver'
        })
        print(f"     FAILED: {symbol}")

def cleanup_job():
    """Cleans up all chart requests and data (Midnight Cleanup)."""
    print(f"[{datetime.now(MARKET_TZ)}] Running Midnight Chart Cleanup...")
    try:
        main_db.child('system/requests/chart').delete()
        main_db.child('system/data/chart').delete()
        print("     Cleanup successful.")
    except Exception as e:
        print(f"     Cleanup failed: {e}")

def run_scheduler():
    """Runs the midnight cleanup scheduler."""
    schedule.every().day.at("00:00").do(cleanup_job)
    while True:
        schedule.run_pending()
        time.sleep(60)

def start_gateway():
    print("Season 3 Chart Gateway Daemon Started.")
    
    # Start cleanup scheduler in a separate thread
    Thread(target=run_scheduler, daemon=True).start()

    def on_request_change(event):
        """Callback for RTDB chart request listener."""
        try:
            if event.data is None: return
            
            path = event.path.strip('/')
            path_parts = path.split('/') if path else []
            
            if len(path_parts) == 1: # /SYMBOL (Individual update)
                symbol = path_parts[0]
                process_chart_request(symbol, event.data)
            elif len(path_parts) == 0: # Root change / (Initial load or bulk)
                if isinstance(event.data, dict):
                    for symbol, req_data in event.data.items():
                        if req_data.get('status') == 'PENDING':
                            process_chart_request(symbol, req_data)
        except Exception as e:
            print(f"Error in on_request_change: {e}")

    # Watch chart requests with a reconnection loop
    while True:
        try:
            print(f"[{datetime.now(MARKET_TZ)}] Starting RTDB Listener...")
            listener = main_db.child('system/requests/chart').listen(on_request_change)
            
            # Keep the main thread alive while checking for listener health (or refresh periodically)
            # We'll refresh the listener every 4 hours to prevent stale connections
            for _ in range(240): # 4 hours (240 * 60 seconds)
                time.sleep(60)
            
            print(f"[{datetime.now(MARKET_TZ)}] Periodic listener refresh...")
            listener.close()
        except Exception as e:
            print(f"[{datetime.now(MARKET_TZ)}] Listener encountered an error: {e}")
            print("Waiting 10 seconds before reconnecting...")
            time.sleep(10)

if __name__ == "__main__":
    # python -m backend.chart_gateway
    start_gateway()
