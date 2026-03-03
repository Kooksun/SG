import os
import sys

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.append(root_dir)

from backend.firebase_config import main_firestore
from firebase_admin import firestore

def fix_cash_to_balance():
    users_ref = main_firestore.collection('users')
    docs = users_ref.stream()
    
    fixed_count = 0
    for doc in docs:
        data = doc.to_dict()
        if 'cash' in data:
            cash_val = data['cash']
            balance_val = data.get('balance', 0)
            
            new_balance = balance_val + cash_val
            
            # Update doc: ADD cash to balance, and remove 'cash' field
            users_ref.document(doc.id).update({
                'balance': new_balance,
                'cash': firestore.DELETE_FIELD
            })
            print(f"Fixed user {doc.id} ({data.get('displayName', 'Unknown')}): transferred {cash_val} to balance. New balance: {new_balance}")
            fixed_count += 1
            
    print(f"Total {fixed_count} users fixed.")

if __name__ == "__main__":
    fix_cash_to_balance()
