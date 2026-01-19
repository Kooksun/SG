import os
import firebase_admin
from firebase_admin import credentials, firestore, db as rtdb
from datetime import datetime
from zoneinfo import ZoneInfo
import sys

# Add data_engine to path to import from adjacent files
sys.path.append(os.path.dirname(__file__))

from scheduler_rtdb import record_ranking_history, fetch_job, now_kst

MARKET_TZ = ZoneInfo("Asia/Seoul")
UID = "Cz3rKYKj8vcvQyHPZV71pM8RnD12"

def restore_portfolio():
    # Initialize Firebase
    cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://stock-8ff9e-default-rtdb.firebaseio.com'
        })
    
    db = firestore.client()
    user_ref = db.collection('users').document(UID)
    
    print(f"--- Restoring Portfolio for User: {UID} ---")
    
    # 1. Restore User Document Fields
    # State before bug: 1250 LMT bought on 1/15.
    restore_data = {
        "balance": 0,
        "usedCredit": 499253803,
        "totalAssetValue": 553662128, # Net equity at time of purchase
        "lastInterestDate": datetime.now(MARKET_TZ).strftime("%Y-%m-%d")
    }
    
    # 2. Restore Portfolio Item (LMT)
    portfolio_ref = user_ref.collection('portfolio').document('LMT')
    # Pre-bug avg price was 841,754 KRW
    # Current price? We'll set it to something reasonable but averagePrice is the most important for history.
    portfolio_data = {
        "symbol": "LMT",
        "name": "록히드 마틴",
        "quantity": 1250,
        "averagePrice": 841754,
        "currentPrice": 841754, # Placeholder, will be updated by scheduler
        "valuation": 1250 * 841754
    }
    
    # 3. Erroneous Transactions to delete
    bad_tx_ids = ['XLJRVeXF6Yp7ODMVLA71', 'DSpEtGgGq2zMFw58Qa9n']
    
    try:
        # Atomic-ish update
        user_ref.update(restore_data)
        portfolio_ref.set(portfolio_data)
        print(f"Set user fields: {restore_data}")
        print(f"Set portfolio/LMT: {portfolio_data}")
        
        for tx_id in bad_tx_ids:
            db.collection('transactions').document(tx_id).delete()
            print(f"Deleted erroneous transaction: {tx_id}")
            
        print("\nTriggering Leaderboard and price update...")
        fetch_job(force=True)
        record_ranking_history()
        
        print("\n--- Portfolio restoration completed successfully ---")
        
    except Exception as e:
        print(f"Error during restoration: {e}")

if __name__ == "__main__":
    restore_portfolio()
