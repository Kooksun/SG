import os
import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime
from zoneinfo import ZoneInfo

MARKET_TZ = ZoneInfo("Asia/Seoul")

def check_rtdb():
    # Use the service account key from the data_engine directory
    cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://stock-8ff9e-default-rtdb.firebaseio.com'
        })
    
    # Check history_requests
    ref = db.reference('history_requests')
    requests = ref.get()
    
    print(f"Current Time: {datetime.now(MARKET_TZ)}")
    if not requests:
        print("No history requests found.")
        return

    print(f"Found {len(requests)} history requests:")
    for symbol, data in requests.items():
        if isinstance(data, dict):
            status = data.get('status')
            req_at = data.get('requestedAt')
            print(f"  - {symbol}: status={status}, requestedAt={req_at}")
        else:
            print(f"  - {symbol}: data={data}")

    # Check ai_requests
    ai_ref = db.reference('ai_requests')
    ai_requests = ai_ref.get()
    if ai_requests:
        print(f"\nFound {len(ai_requests)} AI requests:")
        for uid, data in ai_requests.items():
            if isinstance(data, dict):
                status = data.get('status')
                print(f"  - {uid}: status={status}")

    # Check search_requests
    search_ref = db.reference('search_requests')
    search_requests = search_ref.get()
    if search_requests:
        print(f"\nFound {len(search_requests)} search requests:")
        for uid, data in search_requests.items():
            if isinstance(data, dict):
                status = data.get('status')
                print(f"  - {uid}: status={status}")

    # Check heartbeats
    updated_at = db.reference('system/updatedAt').get()
    stocks_upd = db.reference('system/stocksUpdatedAt').get()
    indices_upd = db.reference('system/indicesUpdatedAt').get()
    
    print(f"\nScheduler Health Status:")
    print(f"  - system/updatedAt: {updated_at}")
    print(f"  - system/stocksUpdatedAt: {stocks_upd}")
    print(f"  - system/indicesUpdatedAt: {indices_upd}")

if __name__ == "__main__":
    check_rtdb()
