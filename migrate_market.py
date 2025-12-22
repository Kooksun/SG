import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

# Add data_engine to path to import modules
sys.path.append(os.path.join(os.path.dirname(__file__), 'data_engine'))

import FinanceDataReader as fdr
from firebase_admin import db
import firestore_client
from fetcher import US_TICKER_MAP

MARKET_TZ = ZoneInfo("Asia/Seoul")

def migrate():
    print("Starting market info migration...")
    
    # 1. Fetch KRX listing for lookup
    print("Fetching KRX listing...")
    df = fdr.StockListing('KRX')
    df['Code'] = df['Code'].astype(str)
    kr_map = {row['Code']: row['Market'] for _, row in df.iterrows()}
    
    # 2. Fetch all stocks from RTDB
    ref = db.reference('stocks')
    stocks_data = ref.get()
    
    if not stocks_data:
        print("No stocks found in RTDB.")
        return
    
    print(f"Found {len(stocks_data)} stocks in RTDB. Updating market info...")
    
    updates = {}
    count_krx = 0
    count_kosdaq = 0
    count_us = 0
    count_unknown = 0
    
    for symbol, data in stocks_data.items():
        is_us = symbol in US_TICKER_MAP
        current_market = data.get('market')
        
        new_market = None
        if is_us:
            new_market = 'NASDAQ'
            count_us += 1
        elif symbol in kr_map:
            raw_market = kr_map[symbol]
            if 'KOSDAQ' in raw_market:
                new_market = 'KOSDAQ'
                count_kosdaq += 1
            else:
                new_market = 'KRX' # KOSPI
                count_krx += 1
        else:
            # Fallback if not in current listing (e.g. delisted or other)
            # Default to KRX if it looks like a KR symbol (numeric)
            if symbol.isdigit():
                new_market = 'KRX'
            else:
                new_market = 'NASDAQ'
            count_unknown += 1
            
        if new_market != current_market:
            updates[f"{symbol}/market"] = new_market
            
    if updates:
        print(f"Applying {len(updates)} updates to RTDB...")
        ref.update(updates)
        print("Migration completed successfully.")
    else:
        print("All stocks already have correct market info.")
        
    print(f"Stats: KRX: {count_krx}, KOSDAQ: {count_kosdaq}, US: {count_us}, Unknown: {count_unknown}")

if __name__ == "__main__":
    migrate()
