import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import os

# Initialize Firebase Admin
cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
cred = credentials.Certificate(cred_path)
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
