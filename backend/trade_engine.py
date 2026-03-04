import time
import math
from datetime import datetime
from firebase_admin import firestore
from .firebase_config import main_db, kospi_db, kosdaq_db, main_firestore, sync_user_to_rtdb
from .supabase_client import get_supabase
from .fetcher import MARKET_TZ, fetch_custom_stocks

# Constants
FEE_RATE_SELL = 0.002  # 0.2% (SELL only)
TICKER_THRESHOLD = 50000000 # 50M KRW
PROFIT_RATIO_THRESHOLD = 0.1 # 10%
MAX_TICKERS = 50

def get_latest_price(symbol: str) -> tuple[float, str, float]:
    """Fetch latest price and change_percent from nested RTDB structure."""
    # 1. Try KOSPI
    stock_kp = kospi_db.child(f'stocks/KOSPI/{symbol}').get()
    if stock_kp:
        return float(stock_kp.get('price', 0)), 'KOSPI', float(stock_kp.get('change_percent', 0))
    
    # 2. Try ETF (also in KOSPI DB)
    stock_etf = kospi_db.child(f'stocks/ETF/{symbol}').get()
    if stock_etf:
        return float(stock_etf.get('price', 0)), 'ETF', float(stock_etf.get('change_percent', 0))
    
    # 3. Try KOSDAQ
    stock_kq = kosdaq_db.child(f'stocks/KOSDAQ/{symbol}').get()
    if stock_kq:
        return float(stock_kq.get('price', 0)), 'KOSDAQ', float(stock_kq.get('change_percent', 0))
    
    # 3. Fallback: Fetch directly from Naver and Register to custom_stocks
    print(f"  ? Symbol {symbol} not in DB. Searching Naver...")
    batch_data = fetch_custom_stocks([symbol])
    if symbol in batch_data:
        stock_obj = batch_data[symbol]
        price = stock_obj.price
        change_p = stock_obj.change_percent
        
        # Register to custom_stocks for future tracking with CORRECT market
        main_db.child('system/custom_stocks').child(symbol).update({
            'addedAt': datetime.now(MARKET_TZ).isoformat(),
            'market': stock_obj.market
        })
        print(f"  + Registered {symbol} to custom_stocks tracking ({stock_obj.market}).")
        return price, stock_obj.market, change_p

    return 0.0, None, 0.0

def calculate_fee(side: str, market: str, amount: float, tax_points: float = 0) -> tuple[float, float, float]:
    """
    Calculates Transaction Tax (거래세).
    BUY: 0%
    SELL: 0.2% (KOSPI/KOSDAQ), 0% (ETF)
    """
    if side == 'BUY':
        return 0.0, 0.0, 0.0
    
    if market == 'ETF':
        return 0.0, 0.0, 0.0
    
    raw_fee = math.floor(amount * FEE_RATE_SELL)
    
    # Mini-game tax point deduction logic
    discount = min(float(raw_fee), float(tax_points))
    final_fee = float(raw_fee) - discount
    
    return float(raw_fee), float(discount), float(final_fee)

def record_to_supabase(uid, symbol, name, tx_type, price, quantity, amount, raw_fee, discount, final_fee, balance_change, stock_change, **kwargs):
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
            "profit": kwargs.get('profit', 0),
            "profit_ratio": kwargs.get('profit_ratio', 0),
            "timestamp": datetime.now(MARKET_TZ).isoformat()
        }
        supabase.table("trade_records").insert(data).execute()
    except Exception as e:
        print(f"Error logging to Supabase: {e}")

def broadcast_ticker(display_name, symbol, name, tx_type, amount, profit_ratio=None):
    """Broadcasts large trade to Main RTDB system/tickers."""
    try:
        ticker_ref = main_db.child('system/tickers')
        current_tickers = ticker_ref.child('list').get() or []
        
        new_ticker = {
            "displayName": display_name,
            "symbol": symbol,
            "name": name,
            "type": tx_type,
            "amount": float(amount),
            "timestamp": datetime.now(MARKET_TZ).isoformat()
        }
        
        if profit_ratio is not None:
            new_ticker["profitRatio"] = round(profit_ratio * 100, 2)
        
        # Prepend and slice
        updated_list = [new_ticker] + current_tickers
        updated_list = updated_list[:MAX_TICKERS]
        
        ticker_ref.set({
            "list": updated_list,
            "lastUpdate": datetime.now(MARKET_TZ).isoformat()
        })
        
        tag = "[TICKER]"
        if profit_ratio is not None:
            tag = f"[TICKER][{profit_ratio*100:+.1f}%]"
            
        print(f"  {tag} Broadcasted: {display_name} | {tx_type} {name} ({amount:,.0f} KRW)")
    except Exception as e:
        print(f"Error broadcasting ticker: {e}")

def process_order(uid: str, order_id: str, order_data: dict):
    """Executes order with Firestore Transaction and RTDB status update."""
    symbol = order_data.get('symbol')
    req_quantity = order_data.get('quantity')
    side = order_data.get('type') # BUY or SELL
    order_type = order_data.get('orderType') # MARKET or LIMIT
    target_price = order_data.get('targetPrice') or order_data.get('price')

    # Status check (Idempotency)
    if order_data.get('status') != 'PENDING':
        return

    # 1. Price Check
    curr_price, market, change_percent = get_latest_price(symbol)
    if curr_price <= 0:
        main_db.child(f'orders/{uid}/{order_id}').update({
            'status': 'FAILED',
            'errorMessage': 'Stock price not found.'
        })
        return

    # [Reality Engine] Market Limit Protection (±29.5%)
    # Skip for Bots as requested
    is_bot = order_data.get('isBot', False)
    if not is_bot and abs(change_percent) >= 29.5:
        main_db.child(f'orders/{uid}/{order_id}').update({
            'status': 'FAILED',
            'errorMessage': '상/하한가 도달 종목은 거래가 제한됩니다.'
        })
        print(f"  !! BLOCKED: {symbol} at {change_percent}% limit.")
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
        tax_points = user_data.get('taxPoints', 0)
        raw_fee, disc, final_fee = calculate_fee(side, market, total_amount, tax_points)
        
        kwargs_out = {}
        if side == 'BUY':
            total_cost = total_amount + final_fee
            if balance < total_cost: return "Insufficient Balance"
            
            transaction.update(user_ref, {
                'balance': firestore.Increment(-total_cost),
                'totalStockValue': firestore.Increment(total_amount)
            })
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
            profit_ratio = (curr_price - avg_price) / avg_price if avg_price > 0 else 0
            
            # For SELL, we decrement totalStockValue based on the cost basis (avg_price)
            # This keeps the math consistent since cost basis * qty is what we move.
            cost_basis_sold = math.floor(avg_price * req_quantity)
            transaction.update(user_ref, {
                'balance': firestore.Increment(proceeds),
                'totalStockValue': firestore.Increment(-cost_basis_sold)
            })
            new_qty = curr_qty - req_quantity
            if new_qty == 0:
                transaction.delete(portfolio_ref)
            else:
                transaction.update(portfolio_ref, {
                    'quantity': new_qty,
                    'updatedAt': firestore.SERVER_TIMESTAMP
                })
            
            # Deduct used tax points
            if disc > 0:
                transaction.update(user_ref, {
                    'taxPoints': firestore.Increment(-disc)
                })
            
            balance_change = proceeds
            stock_change = -req_quantity
        
        # Record Transaction to User History sub-collection
        history_ref = user_ref.collection('history').document()
        history_item = {
            'symbol': symbol, 'name': order_data.get('name', symbol),
            'type': side, 'price': curr_price, 'quantity': req_quantity,
            'totalAmount': total_amount, 
            'rawFee': raw_fee,
            'discount': disc,
            'fee': final_fee, 
            'orderId': order_id,
            'timestamp': firestore.SERVER_TIMESTAMP
        }
        
        profit = 0
        kwargs_out = {}
        if side == 'SELL':
            profit = math.floor((curr_price - avg_price) * req_quantity)
            history_item['profit'] = profit
            history_item['profitRatio'] = profit_ratio
            kwargs_out = {"profit": profit, "profit_ratio": profit_ratio}

        transaction.set(history_ref, history_item)

        return {
            "uid": uid, "symbol": symbol, "name": order_data.get('name', symbol),
            "displayName": user_data.get('displayName', 'Anonymous'),
            "tx_type": side, "price": curr_price, "quantity": req_quantity,
            "amount": total_amount, "raw_fee": raw_fee, "discount": disc,
            "final_fee": final_fee, "balance_change": balance_change, "stock_change": stock_change,
            **kwargs_out
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
            
            # Sync to RTDB Cache for Leaderboard (Zero-Read Optimization)
            sync_user_to_rtdb(uid)
            
            # Ticker for large trades or high profit/loss
            is_large_trade = result['amount'] >= TICKER_THRESHOLD
            is_high_profit = result['tx_type'] == 'SELL' and abs(result.get('profit_ratio', 0)) >= PROFIT_RATIO_THRESHOLD
            
            if is_large_trade or is_high_profit:
                broadcast_ticker(
                    result.get('displayName', 'Anonymous'),
                    result['symbol'], 
                    result['name'], 
                    result['tx_type'], 
                    result['amount'],
                    profit_ratio=result.get('profit_ratio')
                )
            
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
