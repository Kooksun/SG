from firebase_admin import firestore
from .firebase_config import main_firestore

def init_bots():
    print("Initializing AI Bot accounts...")
    
    bots = [
        {
            "uid": "bot_buffett",
            "displayName": "워런 버핏 (AI)",
            "persona": "value_investor",
            "balance": 1000000000, # 1B KRW
        },
        {
            "uid": "bot_bulnabang",
            "displayName": "불나방 (AI)",
            "persona": "speculator",
            "balance": 100000000, # 100M KRW
        },
        {
            "uid": "bot_safety",
            "displayName": "안전지구 (AI)",
            "persona": "conservative",
            "balance": 500000000, # 500M KRW
        }
    ]
    
    for bot in bots:
        uid = bot["uid"]
        user_ref = main_firestore.collection('users').document(uid)
        
        # Check if exists
        if user_ref.get().exists:
            print(f"Bot {uid} already exists. Updating...")
            user_ref.update({
                "displayName": bot["displayName"],
                "isBot": True,
                "persona": bot["persona"]
            })
            continue
            
        user_ref.set({
            "displayName": bot["displayName"],
            "balance": bot["balance"],
            "isBot": True,
            "persona": bot["persona"],
            "creditLimit": 0,
            "usedCredit": 0,
            "totalStockValue": 0,
            "taxPoints": 0,
            "createdAt": firestore.SERVER_TIMESTAMP
        })
        print(f"Initialized Bot: {bot['displayName']} ({uid})")

if __name__ == "__main__":
    init_bots()
