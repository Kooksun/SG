import os
import firebase_admin
from firebase_admin import credentials, firestore, db as rtdb
from datetime import datetime
from zoneinfo import ZoneInfo

MARKET_TZ = ZoneInfo("Asia/Seoul")
UID = "Cz3rKYKj8vcvQyHPZV71pM8RnD12"

def debug_user():
    # Initialize Firebase
    cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://stock-8ff9e-default-rtdb.firebaseio.com'
        })
    
    db = firestore.client()
    
    print(f"--- Debugging User: {UID} ---")
    
    # 1. Check User Document in Firestore
    user_ref = db.collection('users').document(UID)
    user_doc = user_ref.get()
    if user_doc.exists:
        print(f"User Document Found: {user_doc.to_dict()}")
    else:
        print("User Document NOT Found in Firestore.")
    
    # 2. Check Portfolio subcollection
    portfolio_ref = user_ref.collection('portfolio')
    portfolio_docs = portfolio_ref.stream()
    print("\nPortfolio Items:")
    count = 0
    for doc in portfolio_docs:
        print(f"  - {doc.id}: {doc.to_dict()}")
        count += 1
    if count == 0:
        print("  (Empty Portfolio)")
    
    # 3. Check Active Orders subcollection
    orders_ref = user_ref.collection('active_orders')
    order_docs = orders_ref.stream()
    print("\nActive Orders:")
    count = 0
    for doc in order_docs:
        print(f"  - {doc.id}: {doc.to_dict()}")
        count += 1
    if count == 0:
        print("  (No Active Orders)")

    # 4. Check RTDB data
    print("\n--- RTDB Data ---")
    rtdb_ref = rtdb.reference(f'users/{UID}')
    rtdb_data = rtdb_ref.get()
    if rtdb_data:
        print(f"RTDB User Data: {rtdb_data}")
    else:
        print("No RTDB data for user.")

if __name__ == "__main__":
    debug_user()
