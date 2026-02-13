import time
from datetime import datetime
from .firebase_config import main_db
from .fetcher import fetch_custom_stocks, MARKET_TZ

def process_lookup_request(symbol: str, request_data: dict):
    """Fetches single stock info from Naver and uploads to RTDB."""
    if request_data.get('status') != 'PENDING':
        return

    print(f"  -> Lookup Request: {symbol}")
    
    # 1. Update status to PROCESSING
    main_db.child(f'system/requests/lookup/{symbol}').update({
        'status': 'PROCESSING',
        'processedAt': datetime.now(MARKET_TZ).isoformat()
    })

    # 2. Fetch Data
    try:
        batch_data = fetch_custom_stocks([symbol])
        
        if symbol in batch_data:
            stock_obj = batch_data[symbol]
            # 3. Upload to Data path
            main_db.child(f'system/data/lookup/{symbol}').set({
                'symbol': stock_obj.symbol,
                'name': stock_obj.name,
                'price': stock_obj.price,
                'change': stock_obj.change,
                'change_percent': stock_obj.change_percent,
                'volume': stock_obj.volume,
                'market': stock_obj.market,
                'updatedAt': datetime.now(MARKET_TZ).isoformat()
            })
            
            # 4. Update status to COMPLETED
            main_db.child(f'system/requests/lookup/{symbol}').update({
                'status': 'COMPLETED',
                'completedAt': datetime.now(MARKET_TZ).isoformat()
            })

            # Also register to custom_stocks with CORRECT market info
            main_db.child('system/custom_stocks').child(symbol).update({
                'addedAt': datetime.now(MARKET_TZ).isoformat(),
                'market': stock_obj.market
            })
            print(f"     SUCCESS: Found {stock_obj.name} ({symbol}) on {stock_obj.market}")
        else:
            # 4. Update status to FAILED
            main_db.child(f'system/requests/lookup/{symbol}').update({
                'status': 'FAILED',
                'errorMessage': '종목 정보를 찾을 수 없습니다.'
            })
            print(f"     FAILED: {symbol} not found on Naver")
    except Exception as e:
        print(f"     ERROR during lookup for {symbol}: {e}")
        main_db.child(f'system/requests/lookup/{symbol}').update({
            'status': 'FAILED',
            'errorMessage': str(e)
        })

def start_gateway():
    print("Season 3 Lookup Gateway Daemon Started.")
    
    def on_request_change(event):
        """Callback for RTDB lookup request listener."""
        try:
            print(f"[{datetime.now(MARKET_TZ)}] Event Received: Path={event.path}, Data={event.data}")
            if event.data is None: return
            
            path = event.path.strip('/')
            path_parts = path.split('/') if path else []
            
            # Handle different path structures from listener
            if len(path_parts) == 1: # /SYMBOL
                symbol = path_parts[0]
                if isinstance(event.data, dict) and event.data.get('status') == 'PENDING':
                    process_lookup_request(symbol, event.data)
            elif len(path_parts) == 2: # /SYMBOL/status or similar
                symbol = path_parts[0]
                # If only status was updated to PENDING
                if path_parts[1] == 'status' and event.data == 'PENDING':
                    # We need to fetch the full request data to process
                    full_data = main_db.child(f'system/requests/lookup/{symbol}').get()
                    process_lookup_request(symbol, full_data)
            elif len(path_parts) == 0: # Root change /
                if isinstance(event.data, dict):
                    for symbol, req_data in event.data.items():
                        if isinstance(req_data, dict) and req_data.get('status') == 'PENDING':
                            process_lookup_request(symbol, req_data)
        except Exception as e:
            print(f"Error in lookup on_request_change: {e}")

    # Watch lookup requests
    main_db.child('system/requests/lookup').listen(on_request_change)
    
    while True:
        time.sleep(60)

if __name__ == "__main__":
    # python -m backend.lookup_gateway
    start_gateway()
