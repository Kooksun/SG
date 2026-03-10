import firebase_admin
from firebase_admin import credentials, db, firestore
import os
from dotenv import load_dotenv

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path)

def initialize_firebase_apps():
    """Initializes and returns apps for Main, KOSPI, and KOSDAQ projects."""
    
    # 1. Main Project
    main_key = os.getenv('MAIN_FIREBASE_KEY')
    main_url = os.getenv('MAIN_RTDB_URL')
    main_cred = credentials.Certificate(os.path.join(os.path.dirname(__file__), main_key))
    main_app = firebase_admin.initialize_app(main_cred, {
        'databaseURL': main_url
    }, name='main')
    
    # 2. KOSPI Project
    kospi_key = os.getenv('KOSPI_FIREBASE_KEY')
    kospi_url = os.getenv('KOSPI_RTDB_URL')
    kospi_cred = credentials.Certificate(os.path.join(os.path.dirname(__file__), kospi_key))
    kospi_app = firebase_admin.initialize_app(kospi_cred, {
        'databaseURL': kospi_url
    }, name='kospi')
    
    # 3. KOSDAQ Project
    kosdaq_key = os.getenv('KOSDAQ_FIREBASE_KEY')
    kosdaq_url = os.getenv('KOSDAQ_RTDB_URL')
    kosdaq_cred = credentials.Certificate(os.path.join(os.path.dirname(__file__), kosdaq_key))
    kosdaq_app = firebase_admin.initialize_app(kosdaq_cred, {
        'databaseURL': kosdaq_url
    }, name='kosdaq')
    
    # 4. Ranking Project
    ranking_key = os.getenv('RANKING_FIREBASE_KEY')
    ranking_url = os.getenv('RANKING_RTDB_URL')
    ranking_cred = credentials.Certificate(os.path.join(os.path.dirname(__file__), ranking_key))
    ranking_app = firebase_admin.initialize_app(ranking_cred, {
        'databaseURL': ranking_url
    }, name='ranking')
    
    return main_app, kospi_app, kosdaq_app, ranking_app

# Global accessors
main_app, kospi_app, kosdaq_app, ranking_app = initialize_firebase_apps()

# DB references
main_db = db.reference(app=main_app)
kospi_db = db.reference(app=kospi_app)
kosdaq_db = db.reference(app=kosdaq_app)
ranking_db = db.reference(app=ranking_app)

# Firestore (Main only usually)
main_firestore = firestore.client(app=main_app)

def sync_user_to_rtdb(uid: str):
    """
    Syncs essential user data and portfolio from Firestore to RTDB.
    This serves as a cache for the leaderboard to avoid scanning Firestore.
    """
    try:
        user_ref = main_firestore.collection('users').document(uid)
        user_snap = user_ref.get()
        if not user_snap.exists:
            return

        user_data = user_snap.to_dict()
        
        # 1. Fetch Portfolio
        portfolio_ref = user_ref.collection('portfolio')
        portfolio_docs = portfolio_ref.stream()
        
        portfolio_items = {}
        for doc in portfolio_docs:
            data = doc.to_dict()
            symbol = doc.id
            qty = float(data.get('quantity', 0))
            if qty > 0:
                portfolio_items[symbol] = {
                    'symbol': symbol,
                    'quantity': qty,
                    'averagePrice': float(data.get('averagePrice', 0))
                }

        # 2. Prepare Sync Payload
        import time
        now_ms = int(time.time() * 1000)
        
        sync_payload = {
            'uid': uid,
            'displayName': user_data.get('displayName', 'Anonymous'),
            'photoURL': user_data.get('photoURL', ''),
            'balance': float(user_data.get('balance', 0)),
            'startingBalance': float(user_data.get('startingBalance', user_data.get('starting_balance', 300_000_000))),
            'portfolio': portfolio_items,
            'updatedAt': now_ms,
            'lastSync': now_ms
        }

        # 3. Update RTDB Cache
        # We store it in ranking_cache/uid
        ranking_db.child('ranking_cache').child(uid).set(sync_payload)
        
        print(f"  [SYNC] {uid} synced to RTDB cache.")
    except Exception as e:
        print(f"Error syncing user {uid} to RTDB: {e}")

if __name__ == "__main__":
    print("Testing Firebase connections...")
    try:
        print(f"Main RTDB: {main_db.path}")
        print(f"KOSPI RTDB: {kospi_db.path}")
        print(f"KOSDAQ RTDB: {kosdaq_db.path}")
        print("Success: All Firebase apps initialized.")
    except Exception as e:
        print(f"Error: {e}")
