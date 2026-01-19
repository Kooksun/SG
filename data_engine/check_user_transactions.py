import os
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
from zoneinfo import ZoneInfo

MARKET_TZ = ZoneInfo("Asia/Seoul")
UID = "Cz3rKYKj8vcvQyHPZV71pM8RnD12"

def check_transactions():
    # Initialize Firebase
    cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://stock-8ff9e-default-rtdb.firebaseio.com'
        })
    
    db = firestore.client()
    
    print(f"--- Transactions for User: {UID} ---")
    
    tx_ref = db.collection('transactions')
    query = tx_ref.where('uid', '==', UID).order_by('timestamp', direction=firestore.Query.DESCENDING).limit(200)
    docs = query.stream()
    
    count = 0
    for doc in docs:
        print(f"  - {doc.id}: {doc.to_dict()}")
        count += 1
    
    if count == 0:
        print("No transactions found for this user.")

if __name__ == "__main__":
    check_transactions()
