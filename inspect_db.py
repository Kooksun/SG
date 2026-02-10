import os
import firebase_admin
from firebase_admin import credentials, firestore

def inspect_collections():
    # Attempt to initialize with seasonal credentials if available, otherwise fallback
    cred_path = os.path.join(os.path.dirname(__file__), 'backend/kooksun-stock-main-firebase-adminsdk-fbsvc-a18b681ff0.json')
    if not os.path.exists(cred_path):
        cred_path = os.path.join(os.path.dirname(__file__), 'data_engine/serviceAccountKey.json')

    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    
    db = firestore.client()
    
    print("--- Inspecting Root Collections ---")
    collections = db.collections()
    for coll in collections:
        print(f"Collection: {coll.id}")
        
    print("\n--- Listing first 5 documents in 'transactions' ---")
    tx_docs = db.collection('transactions').limit(5).get()
    for doc in tx_docs:
        print(f"ID: {doc.id}, Data: {list(doc.to_dict().keys())}")
        if 'uid' in doc.to_dict():
            print(f"  UID: {doc.get('uid')}")

    print("\n--- Checking 'users' for 'history' sub-collection ---")
    users = db.collection('users').limit(3).get()
    for user in users:
        uid = user.id
        print(f"User UID: {uid}")
        history_docs = db.collection('users').document(uid).collection('history').limit(5).get()
        if history_docs:
            print(f"  Found {len(history_docs)} docs in 'history' sub-collection!")
            for hdoc in history_docs:
                print(f"    History ID: {hdoc.id}, Data: {list(hdoc.to_dict().keys())}")
        else:
            print(f"  No 'history' sub-collection found for this user.")

if __name__ == "__main__":
    inspect_collections()
