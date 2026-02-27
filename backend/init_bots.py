from firebase_admin import firestore
from .firebase_config import main_firestore
from .supabase_client import get_supabase

def init_bots():
    print("Initializing AI Bot accounts...")
    
    bots = [
        {
            "uid": "bot_buffett",
            "displayName": "워런 버핏 (AI)",
            "persona": "value_investor",
            "balance": 300000000,
        },
        {
            "uid": "bot_bulnabang",
            "displayName": "불나방 (AI)",
            "persona": "speculator",
            "balance": 300000000,
        },
        {
            "uid": "bot_safety",
            "displayName": "안전지구 (AI)",
            "persona": "conservative",
            "balance": 300000000,
        }
    ]
    
    for bot in bots:
        uid = bot["uid"]
        user_ref = main_firestore.collection('users').document(uid)
        
        # Clear existing portfolio
        portfolio_ref = user_ref.collection('portfolio')
        docs = portfolio_ref.stream()
        deleted_count = 0
        for doc in docs:
            doc.reference.delete()
            deleted_count += 1
        
        if deleted_count > 0:
            print(f"  - Cleared {deleted_count} holdings for {uid}")

        # Clear Firestore history
        history_ref = user_ref.collection('history')
        h_docs = history_ref.stream()
        h_deleted = 0
        for h in h_docs:
            h.reference.delete()
            h_deleted += 1
        if h_deleted > 0:
            print(f"  - Cleared {h_deleted} history records for {uid}")
            
        # Clear Supabase records
        supabase = get_supabase()
        if supabase:
            try:
                res = supabase.table("trade_records").delete().eq("uid", uid).execute()
                print(f"  - Cleared Supabase trade records for {uid}")
            except Exception as e:
                print(f"  - Error clearing Supabase for {uid}: {e}")

        # Check if exists
        if user_ref.get().exists:
            print(f"Bot {uid} already exists. Updating balance and info...")
            user_ref.update({
                "displayName": bot["displayName"],
                "balance": bot["balance"],
                "isBot": True,
                "persona": bot["persona"],
                "totalStockValue": 0
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
