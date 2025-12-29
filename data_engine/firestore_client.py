import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import os

# Initialize Firebase Admin
cred_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')

if cred_json:
    import json
    # If JSON string is provided via environment variable
    cred_dict = json.loads(cred_json)
    cred = credentials.Certificate(cred_dict)
    print("Initializing Firebase with credentials from environment variable.")
else:
    # Use local file as fallback
    cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        print(f"Initializing Firebase with credentials from file: {cred_path}")
    else:
        raise ValueError("Firebase credentials not found. Provide FIREBASE_SERVICE_ACCOUNT_JSON env var or serviceAccountKey.json file.")

firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://stock-8ff9e-default-rtdb.firebaseio.com/'
})

db = firestore.client()

def get_db():
    return db

if __name__ == "__main__":
    # Test connection
    try:
        docs = db.collection('test').limit(1).get()
        print("Firestore connection successful!")
    except Exception as e:
        print(f"Error connecting to Firestore: {e}")
