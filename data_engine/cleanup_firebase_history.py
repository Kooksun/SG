import firebase_admin
from firebase_admin import db
import os
import sys

# Add project root to path for firestore_client if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import firestore_client # This initializes the Firebase app
    print("Firebase app initialized.")
except ImportError:
    print("Error: Could not import firestore_client. Make sure you are in the data_engine directory or it's in your path.")
    sys.exit(1)

def cleanup_firebase_history():
    print("--- Cleaning up Firebase RTDB stock_history ---")
    history_ref = db.reference('stock_history')
    
    # Check if data exists
    data = history_ref.get()
    if not data:
        print("No stock_history data found in Firebase RTDB. Nothing to delete.")
        return

    print(f"Found history data for {len(data)} stocks.")
    confirm = input("Are you sure you want to delete ALL stock_history from Firebase? (y/n): ")
    
    if confirm.lower() == 'y':
        try:
            history_ref.delete()
            print("SUCCESS: Deleted stock_history from Firebase RTDB.")
        except Exception as e:
            print(f"FAILURE: Error deleting data: {e}")
    else:
        print("Deletion cancelled.")

if __name__ == "__main__":
    cleanup_firebase_history()
