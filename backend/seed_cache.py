from .firebase_config import main_firestore, sync_user_to_rtdb
import time

def seed_all_users():
    print("Starting one-time seeding of ranking_cache from Firestore...")
    users_ref = main_firestore.collection('users')
    users = users_ref.stream()
    
    count = 0
    for user in users:
        uid = user.id
        print(f" -> Syncing {uid}...")
        sync_user_to_rtdb(uid)
        count += 1
        # Add a small delay to avoid hitting rate limits if there are many users
        time.sleep(0.1)
        
    print(f"Finished seeding {count} users.")

if __name__ == "__main__":
    seed_all_users()
