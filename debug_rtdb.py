import os
import firebase_admin
from firebase_admin import credentials, db
from backend.firebase_config import kospi_db, kosdaq_db

def debug_rtdb():
    print("--- KOSPI Stocks (Samsung) ---")
    # Samsung Electronics
    samsung = kospi_db.child('stocks').child('005930').get()
    print(f"Samsung: {samsung}")
    
    print("\n--- KOSDAQ Stocks Sample ---")
    # Search for any symbol if we don't know a specific one
    kosdaq_sample = kosdaq_db.child('stocks').order_by_key().limit_to_first(3).get()
    print(f"KOSDAQ Sample: {kosdaq_sample}")

if __name__ == "__main__":
    debug_rtdb()
