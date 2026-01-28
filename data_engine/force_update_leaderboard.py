import os
import firebase_admin
from firebase_admin import credentials, firestore, db as rtdb
from datetime import datetime
from zoneinfo import ZoneInfo
import sys

# Add data_engine to path to import from adjacent files
sys.path.append(os.path.dirname(__file__))

from scheduler_rtdb import record_ranking_history, fetch_job, now_kst

def force_update_leaderboard():
    # Initialize Firebase if not already
    cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://stock-8ff9e-default-rtdb.firebaseio.com'
        })
    
    print(f"[{now_kst()}] Force updating leaderboard/ranking history...")
    
    # 0. Refresh held stocks cache
    from scheduler_rtdb import refresh_held_stocks
    refresh_held_stocks()
    
    # 1. We need latest prices for equity calculation
    print("Fetching latest prices first...")
    fetch_job(force=True)
    
    # 2. Record ranking
    print("Recording ranking history to Supabase...")
    record_ranking_history()
    
    print(f"[{now_kst()}] Leaderboard update triggered successfully.")

if __name__ == "__main__":
    force_update_leaderboard()
