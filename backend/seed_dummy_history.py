import random
import time
from datetime import datetime, timedelta
from firebase_admin import firestore
from .firebase_config import main_firestore

def seed_dummy_data(uid: str, count: int = 200):
    print(f"Seeding {count} dummy history records for user: {uid}")
    
    user_ref = main_firestore.collection('users').document(uid)
    history_ref = user_ref.collection('history')
    
    stocks = [
        {"symbol": "005930", "name": "삼성전자"},
        {"symbol": "000660", "name": "SK하이닉스"},
        {"symbol": "035420", "name": "NAVER"},
        {"symbol": "035720", "name": "카카오"},
        {"symbol": "005380", "name": "현대차"},
        {"symbol": "TSLA", "name": "테슬라"},
        {"symbol": "AAPL", "name": "애플"},
        {"symbol": "NVDA", "name": "엔비디아"}
    ]
    
    batch = main_firestore.batch()
    now = datetime.now()
    
    for i in range(count):
        stock = random.choice(stocks)
        side = random.choice(['BUY', 'SELL'])
        price = random.randint(50000, 1000000)
        quantity = random.randint(1, 100)
        total_amount = price * quantity
        
        # Random timestamp over the last 30 days, descending
        timestamp = now - timedelta(minutes=i * 30 + random.randint(0, 20))
        
        doc_data = {
            'symbol': stock['symbol'],
            'name': stock['name'],
            'type': side,
            'price': price,
            'quantity': quantity,
            'totalAmount': total_amount,
            'orderId': f"dummy_{i}_{int(time.time())}",
            'timestamp': timestamp
        }
        
        # Fee logic
        if side == 'SELL':
            raw_fee = int(total_amount * 0.002)
            discount = random.choice([0, int(raw_fee * 0.5), int(raw_fee * 0.2)]) if random.random() > 0.5 else 0
            final_fee = raw_fee - discount
            
            doc_data['rawFee'] = raw_fee
            doc_data['discount'] = discount
            doc_data['fee'] = final_fee
            
            # Profit logic
            avg_price = random.randint(price - 100000, price + 100000)
            profit = (price - avg_price) * quantity
            profit_ratio = (price - avg_price) / avg_price if avg_price > 0 else 0
            
            doc_data['profit'] = profit
            doc_data['profitRatio'] = profit_ratio
        else:
            doc_data['fee'] = 0
            doc_data['rawFee'] = 0
            doc_data['discount'] = 0

        new_doc_ref = history_ref.document()
        batch.set(new_doc_ref, doc_data)
        
        if (i + 1) % 50 == 0:
            batch.commit()
            batch = main_firestore.batch()
            print(f"  -> Committed {i+1} records...")

    print("Success: 200 dummy records seeded.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        # Try to find the first user
        users = main_firestore.collection('users').limit(1).get()
        if not users:
            print("No users found in Firestore.")
            sys.exit(1)
        target_uid = users[0].id
    else:
        target_uid = sys.argv[1]
        
    seed_dummy_data(target_uid)
