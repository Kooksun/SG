import sys
import os
import math
from datetime import datetime
from zoneinfo import ZoneInfo

# Add the current directory to sys.path to import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from firestore_client import db
from trade_executor import buy_stock, sell_stock

def verify_sell_split():
    test_uid = "test_user_debug_split_1"
    symbol = "005930" # Samsung Electronics
    name = "삼성전자"
    price = 70000
    
    print(f"--- Starting verification for UID: {test_uid} ---")
    
    # 1. Setup: Ensure user exists and has balance
    user_ref = db.collection("users").document(test_uid)
    user_ref.set({
        "balance": 10000000,
        "usedCredit": 0,
        "creditLimit": 500000000,
        "displayName": "Test User Split"
    })
    
    # Clear portfolio and transactions for this user
    portfolio_ref = user_ref.collection("portfolio").document(symbol)
    portfolio_ref.delete()
    
    # 2. Case: Buy some stock (Long)
    print("Action: Buying 10 shares...")
    buy_stock(test_uid, symbol, name, price, 10)
    
    # 3. Case: Sell more than held (Split SELL/SHORT)
    print("Action: Selling 15 shares (expecting 10 SELL, 5 SHORT)...")
    sell_stock(test_uid, symbol, name, price, 15)
    
    # 4. Verify Transactions
    print("\n--- Verifying Transactions ---")
    txs = db.collection("transactions") \
            .where("uid", "==", test_uid) \
            .order_by("timestamp", direction="DESCENDING") \
            .limit(5) \
            .get()
            
    for tx in txs:
        data = tx.to_dict()
        print(f"Type: {data.get('type')}, Qty: {data.get('quantity')}, Amount: {data.get('amount')}")

    # 5. Cleanup
    # user_ref.delete() # Don't delete yet if we want to see it in UI
    print("\n--- Verification Finished ---")

if __name__ == "__main__":
    verify_sell_split()
