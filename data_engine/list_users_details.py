
import firebase_admin
from firebase_admin import credentials, firestore

def list_all_users_details():
    cred_path = 'data_engine/serviceAccountKey.json'
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    
    db = firestore.client()
    users = db.collection('users').stream()
    
    for u in users:
        d = u.to_dict()
        display_name = d.get('displayName', u.id)
        balance = d.get('balance', 0)
        used_credit = d.get('usedCredit', 0)
        total_assets = d.get('totalAssetValue', 0)
        
        print(f"User {display_name} ({u.id}):")
        print(f"  Balance: {balance:,} KRW")
        print(f"  Used Credit: {used_credit:,} KRW")
        print(f"  Total Asset Value (Firestore): {total_assets:,} KRW")
        
        portfolio = db.collection('users').document(u.id).collection('portfolio').get()
        if not portfolio:
            print("  Portfolio: Empty")
        else:
            print("  Portfolio:")
            for item in portfolio:
                idata = item.to_dict()
                qty = idata.get('quantity', 0)
                avg = idata.get('averagePrice', 0)
                print(f"    - {item.id}: qty={qty}, avg={avg:,.2f}")
        print("-" * 40)

if __name__ == "__main__":
    list_all_users_details()
