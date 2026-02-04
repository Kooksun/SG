import time
import math
from datetime import datetime
from firebase_admin import firestore
from .firebase_config import main_db, kospi_db, kosdaq_db, main_firestore
from .supabase_client import get_supabase
from .fetcher import MARKET_TZ

# Constants
FEE_RATE_SELL = 0.002  # 0.2% (SELL only)

def get_latest_price(symbol: str) -> tuple[float, str]:
    """Fetch latest price from KOSPI/KOSDAQ RTDB."""
    # 1. Try KOSPI (includes ETF)
    stock = kospi_db.child(f'stocks/{symbol}').get()
    if stock:
        return float(stock.get('price', 0)), stock.get('market', 'KOSPI')
    
    # 2. Try KOSDAQ
    stock = kosdaq_db.child(f'stocks/{symbol}').get()
    if stock:
        return float(stock.get('price', 0)), stock.get('market', 'KOSDAQ')
    
    return 0.0, None

def calculate_fee(side: str, market: str, amount: float) -> tuple[float, float, float]:
    """
    Calculates raw_fee, discount, and final_fee based on policy.
    BUY: 0%
    SELL: 0.2% (KOSPI/KOSDAQ), 0% (ETF)
    """
    if side == 'BUY':
        return 0.0, 0.0, 0.0
    
    if market == 'ETF':
        return 0.0, 0.0, 0.0
    
    raw_fee = math.floor(amount * FEE_RATE_SELL)
    # Future mini-game discount logic can be added here
    discount = 0.0 
    final_fee = max(0, raw_fee - discount)
    
    return float(raw_fee), float(discount), float(final_fee)

def record_to_supabase(uid, symbol, name, tx_type, price, quantity, amount, raw_fee, discount, final_fee, balance_change, stock_change):
    """Logs the trade to Supabase."""
    supabase = get_supabase()
    if not supabase: return
    try:
        data = {
            "uid": uid,
            "symbol": symbol,
            "stock_name": name,
            "type": tx_type,
            "price": price,
            "quantity": quantity,
            "amount": amount,
            "raw_fee": raw_fee,
            "discount_amount": discount,
            "final_fee": final_fee,
            "balance_change": balance_change,
            "stock_change": stock_change,
            "timestamp": datetime.now(MARKET_TZ).isoformat()
        }
        supabase.table("trade_records").insert(data).execute()
    except Exception as e:
        print(f"Error logging to Supabase: {e}")

def process_order(uid: str, order_id: str, order_data: dict):
    """Executes order with Firestore Transaction and RTDB status update."""
    symbol = order_data.get('symbol')
    req_quantity = order_data.get('quantity')
    side = order_data.get('type') # BUY or SELL
    order_type = order_data.get('orderType') # MARKET or LIMIT
    target_price = order_data.get('targetPrice')

    # Status check (Idempotency)
    if order_data.get('status') != 'PENDING':
        return

    # 1. Price Check
    curr_price, market = get_latest_price(symbol)
    if curr_price <= 0:
        main_db.child(f'orders/{uid}/{order_id}').update({
            'status': 'FAILED',
            'errorMessage': 'Stock price not found.'
        })
        return

    # 2. LIMIT Check
    if order_type == 'LIMIT':
        if side == 'BUY' and curr_price > target_price: return
        if side == 'SELL' and curr_price < target_price: return

    # 3. Firestore Transaction
    transaction = main_firestore.transaction()
    
    @firestore.transactional
    def execute_in_transaction(transaction):
        user_ref = main_firestore.collection('users').document(uid)
        portfolio_ref = user_ref.collection('portfolio').document(symbol)
        
        user_snap = user_ref.get(transaction=transaction)
        portfolio_snap = portfolio_ref.get(transaction=transaction)
        
        if not user_snap.exists: return "User Not Found"
        
        user_data = user_snap.to_dict()
        balance = user_data.get('balance', 0)
        
        curr_qty = 0
        avg_price = 0
        if portfolio_snap.exists:
            p_data = portfolio_snap.to_dict()
            curr_qty = p_data.get('quantity', 0)
            avg_price = p_data.get('averagePrice', 0)

        total_amount = math.floor(curr_price * req_quantity)
        raw_fee, disc, final_fee = calculate_fee(side, market, total_amount)
        
        if side == 'BUY':
            total_cost = total_amount + final_fee
            if balance < total_cost: return "Insufficient Balance"
            
            transaction.update(user_ref, {'balance': firestore.Increment(-total_cost)})
            new_qty = curr_qty + req_quantity
            new_avg = math.floor(((avg_price * curr_qty) + total_amount) / new_qty)
            transaction.set(portfolio_ref, {
                'symbol': symbol,
                'name': order_data.get('name', symbol),
                'quantity': new_qty,
                'averagePrice': new_avg,
                'market': market,
                'updatedAt': firestore.SERVER_TIMESTAMP
            }, merge=True)
            
            balance_change = -total_cost
            stock_change = req_quantity
        else: # SELL
            if curr_qty < req_quantity: return "Insufficient Stock Quantity"
            
            proceeds = total_amount - final_fee
            transaction.update(user_ref, {'balance': firestore.Increment(proceeds)})
            new_qty = curr_qty - req_quantity
            if new_qty == 0:
                transaction.delete(portfolio_ref)
            else:
                transaction.update(portfolio_ref, {
                    'quantity': new_qty,
                    'updatedAt': firestore.SERVER_TIMESTAMP
                })
            
            balance_change = proceeds
            stock_change = -req_quantity

        # Record Transaction to Firestore (Audit)
        tx_ref = main_firestore.collection('transactions').document()
        transaction.set(tx_ref, {
            'uid': uid, 'symbol': symbol, 'name': order_data.get('name', symbol),
            'type': side, 'price': curr_price, 'quantity': req_quantity,
            'amount': total_amount, 'fee': final_fee, 'orderId': order_id,
            'timestamp': firestore.SERVER_TIMESTAMP
        })

        return {
            "uid": uid, "symbol": symbol, "name": order_data.get('name', symbol),
            "tx_type": side, "price": curr_price, "quantity": req_quantity,
            "amount": total_amount, "raw_fee": raw_fee, "discount": disc,
            "final_fee": final_fee, "balance_change": balance_change, "stock_change": stock_change
        }

    try:
        result = execute_in_transaction(transaction)
        if isinstance(result, str):
            main_db.child(f'orders/{uid}/{order_id}').update({
                'status': 'FAILED', 'errorMessage': result
            })
        else:
            # Update RTDB Status
            main_db.child(f'orders/{uid}/{order_id}').update({
                'status': 'COMPLETED',
                'executedPrice': curr_price,
                'fee': result['final_fee'],
                'executedAt': datetime.now(MARKET_TZ).isoformat()
            })
            # Log to Supabase
            record_to_supabase(**result)
            print(f"  -> SUCCESS: {uid} | {side} {symbol} @ {curr_price}")
            
    except Exception as e:
        print(f"Error executing transaction: {e}")
        main_db.child(f'orders/{uid}/{order_id}').update({
            'status': 'ERROR', 'errorMessage': str(e)
        })

def start_engine():
    print("Trade Engine Daemon (Season 3) - RTDB Watch Mode started.")
    
    def on_order_change(event):
        """Callback for RTDB order listener."""
        if event.data is None: return
        
        # event.path might be like "/UID/ORDER_ID" or "/"
        path_parts = event.path.strip('/').split('/')
        
        # We want to catch new orders or status changes to PENDING
        # If it's a bulk initial load or deep update
        if len(path_parts) == 2: # Single order update: /UID/ORDER_ID
            uid, order_id = path_parts
            process_order(uid, order_id, event.data)
        elif len(path_parts) == 0: # Root change /
            for uid, user_orders in event.data.items():
                for oid, odata in user_orders.items():
                    if odata.get('status') == 'PENDING':
                        process_order(uid, oid, odata)

    # Watch all orders
    main_db.child('orders').listen(on_order_change)
    
    # Polling for LIMIT orders (since prices change externally)
    while True:
        try:
            all_users_orders = main_db.child('orders').get()
            if all_users_orders:
                for uid, user_orders in all_users_orders.items():
                    for oid, odata in user_orders.items():
                        if odata.get('status') == 'PENDING' and odata.get('orderType') == 'LIMIT':
                            process_order(uid, oid, odata)
        except Exception as e:
            print(f"Limit polling error: {e}")
        time.sleep(10)

if __name__ == "__main__":
    start_engine()
