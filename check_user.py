from backend.firebase_config import main_firestore
import sys

uid = sys.argv[1]
user_ref = main_firestore.collection('users').document(uid)
user_snap = user_ref.get()

if user_snap.exists:
    data = user_snap.to_dict()
    print(f"User: {uid}")
    print(f"Balance: {data.get('balance')}")
    print(f"taxPoints: {data.get('taxPoints')}")
    print(f"minigameStats: {data.get('minigameStats')}")
else:
    print("User not found")
