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
    
    return main_app, kospi_app, kosdaq_app

# Global accessors
main_app, kospi_app, kosdaq_app = initialize_firebase_apps()

# DB references
main_db = db.reference(app=main_app)
kospi_db = db.reference(app=kospi_app)
kosdaq_db = db.reference(app=kosdaq_app)

# Firestore (Main only usually)
main_firestore = firestore.client(app=main_app)

if __name__ == "__main__":
    print("Testing Firebase connections...")
    try:
        print(f"Main RTDB: {main_db.path}")
        print(f"KOSPI RTDB: {kospi_db.path}")
        print(f"KOSDAQ RTDB: {kosdaq_db.path}")
        print("Success: All Firebase apps initialized.")
    except Exception as e:
        print(f"Error: {e}")
