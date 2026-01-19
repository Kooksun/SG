import os
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
from zoneinfo import ZoneInfo

MARKET_TZ = ZoneInfo("Asia/Seoul")
UID = "Cz3rKYKj8vcvQyHPZV71pM8RnD12"

def restore_user():
    # Initialize Firebase
    cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://stock-8ff9e-default-rtdb.firebaseio.com'
        })
    
    db = firestore.client()
    user_ref = db.collection('users').document(UID)
    
    print(f"--- Restoring User Assets for: {UID} ---")
    
    # Pre-bug state estimation:
    # On 1/15, the user had ~19,627 shares of KRW stock and then bought 1,250 LMT shares.
    # The LMT buy used ~499M credit.
    # The subsequent liquidations wrongly "repaid" only small amounts while removing large shares.
    
    # Restore balance and usedCredit to a state where they haven't been bankrupted.
    # Since it's hard to perfectly reconstruct without a full audit, 
    # we'll reset Balance to 0 (all used for LMT) and usedCredit back to the LMT purchase amount (~500M).
    # This effectively "undoes" the bad liquidations' impact on debt.
    
    restore_data = {
        "balance": 0,
        "usedCredit": 500000000,
        "totalAssetValue": 500000000, # Estimated equity before bad liquidations
        "lastInterestDate": datetime.now(MARKET_TZ).strftime("%Y-%m-%d")
    }
    
    try:
        user_ref.update(restore_data)
        print(f"Successfully restored user {UID} fields: {restore_data}")
        
        # Note: We don't restore the portfolio entries here because the shares were actually sold (though at wrong price).
        # Restoring balance/debt is the most critical part to allow the user to trade again.
        # If the user wants the shares back, they can now use their restored buying power.
        
    except Exception as e:
        print(f"Error restoring user: {e}")

if __name__ == "__main__":
    restore_user()
