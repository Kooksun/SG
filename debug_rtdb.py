import os
import firebase_admin
from firebase_admin import credentials, db
from backend.firebase_config import main_db, kospi_db, kosdaq_db

def debug_rtdb():
    print("--- System Tickers ---")
    tickers = main_db.child('system/tickers').get()
    print(f"Tickers Root: {tickers}")
    
    print("\n--- Tickers List ---")
    ticker_list = main_db.child('system/tickers/list').get()
    print(f"Ticker List: {ticker_list}")

if __name__ == "__main__":
    debug_rtdb()
