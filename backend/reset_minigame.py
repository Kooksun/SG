from .firebase_config import main_firestore
from .fetcher import MARKET_TZ
from datetime import datetime

def reset_all_minigame_attempts():
    """Resets mini-game attempts for all users in Firestore."""
    today_str = datetime.now(MARKET_TZ).strftime('%Y-%m-%d')
    print(f"[*] Resetting mini-game attempts for all users (Date: {today_str})...")
    
    users_ref = main_firestore.collection('users')
    docs = users_ref.stream()
    
    count = 0
    for doc in docs:
        try:
            doc.reference.update({
                'minigameStats.attempts': 0,
                'minigameStats.lastDate': today_str
            })
            count += 1
            if count % 10 == 0:
                print(f"  -> Processed {count} users...")
        except Exception as e:
            print(f"  [!] Error updating user {doc.id}: {e}")
            
    print(f"[V] Successfully reset attempts for {count} users.")

if __name__ == "__main__":
    # To run: python3 -m backend.reset_minigame
    reset_all_minigame_attempts()
