from backend.firebase_config import main_db

def check_orders():
    bot_uids = ["bot_buffett", "bot_bulnabang", "bot_safety"]
    for uid in bot_uids:
        print(f"\nOrders for {uid}:")
        orders = main_db.child(f'orders/{uid}').get()
        if not orders:
            print("  No orders found.")
            continue
        
        for oid, data in orders.items():
            status = data.get('status')
            symbol = data.get('symbol')
            otype = data.get('type')
            ts = data.get('timestamp')
            err = data.get('errorMessage', '')
            print(f"  [{oid}] {ts} | {otype} {symbol} | Status: {status} | Error: {err}")

if __name__ == "__main__":
    check_orders()
