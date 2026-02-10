import schedule
import time
from datetime import datetime
from .firebase_config import main_db, main_firestore, kospi_db, kosdaq_db
from .fetcher import MARKET_TZ
from .price_updater import is_kr_market_open

def get_all_prices():
    """Fetch all prices from KOSPI/KOSDAQ RTDBs to use as a local cache."""
    prices = {}
    kospi_data = kospi_db.child('stocks').get()
    if kospi_data: prices.update(kospi_data)
    
    kosdaq_data = kosdaq_db.child('stocks').get()
    if kosdaq_data: prices.update(kosdaq_data)
    
    return prices

def leaderboard_update_job():
    print(f"[{datetime.now(MARKET_TZ)}] Calculating Leaderboard...")
    
    # 1. Get all current prices
    all_prices = get_all_prices()
    
    # 2. Get all users from Firestore
    try:
        users_ref = main_firestore.collection('users')
        users_docs = users_ref.stream()
        
        rankings = []
        DEFAULT_STARTING_BALANCE = 300000000.0 # 3억 KRW as default for Season 3
        
        # Aggregate stats
        total_equity_sum = 0
        total_yield_sum = 0
        
        user_list = list(users_docs)
        total_players = len(user_list)
        
        print(f"  -> Processing {total_players} users and syncing to Firestore...")
        
        for user_doc in user_list:
            uid = user_doc.id
            user_data = user_doc.to_dict()
            
            cash = float(user_data.get('balance', 0))
            display_name = user_data.get('displayName', 'Anonymous')
            photo_url = user_data.get('photoURL', '')
            starting_balance = float(user_data.get('startingBalance', DEFAULT_STARTING_BALANCE))
            
            # 3. Calculate Portfolio Value
            portfolio_value = 0
            stock_count = 0
            portfolio_ref = users_ref.document(uid).collection('portfolio')
            portfolio_items = portfolio_ref.stream()
            
            for item in portfolio_items:
                p_data = item.to_dict()
                symbol = p_data.get('symbol')
                qty = float(p_data.get('quantity', 0))
                
                # Use live price if available, else use avg price as fallback
                live_price = float(all_prices.get(symbol, {}).get('price', p_data.get('averagePrice', 0)))
                portfolio_value += (qty * live_price)
                if qty > 0: stock_count += 1
            
            total_equity = cash + portfolio_value
            yield_percent = ((total_equity - starting_balance) / starting_balance) * 100 if starting_balance > 0 else 0
            
            total_equity_sum += total_equity
            total_yield_sum += yield_percent
            
            user_rank_data = {
                'uid': uid,
                'displayName': display_name,
                'photoURL': photo_url,
                'equity': round(total_equity, 2),
                'yield': round(yield_percent, 2),
                'cash': round(cash, 2),
                'stockValue': round(portfolio_value, 2)
            }
            rankings.append(user_rank_data)
            
            # Update Firestore User Doc for Frontend Header Consistency
            users_ref.document(uid).update({
                'totalStockValue': round(portfolio_value, 2),
                'totalEquity': round(total_equity, 2), # Frontend can use this
                'pnlRate': round(yield_percent, 2),
                'stockCount': stock_count,
                'lastCalculatedAt': datetime.now(MARKET_TZ).isoformat()
            })
            
        # 4. Sort by Equity descending
        rankings.sort(key=lambda x: x['equity'], reverse=True)
        
        # 5. Add Rank and Sync individual rank back to Firestore
        for i, item in enumerate(rankings):
            rank = i + 1
            item['rank'] = rank
            # Optional: Sync rank to Firestore if needed for profile
            # users_ref.document(item['uid']).update({'rank': rank})
            
        # 6. Process Top/Worst Stocks by Yield (Based on Participant Portfolios)
        stock_yield_agg = {} # {symbol: {'sum_yield': 0, 'count': 0, 'name': ''}}
        
        for doc in user_list:
            uid = doc.id
            p_ref = users_ref.document(uid).collection('portfolio')
            for p_item in p_ref.stream():
                p_data = p_item.to_dict()
                sym = p_data.get('symbol')
                qty = float(p_data.get('quantity', 0))
                avg_price = float(p_data.get('averagePrice', 0))
                
                if sym and qty > 0 and avg_price > 0:
                    live_price = float(all_prices.get(sym, {}).get('price', avg_price))
                    item_yield = ((live_price / avg_price) - 1) * 100
                    
                    if sym not in stock_yield_agg:
                        stock_yield_agg[sym] = {
                            'sum_yield': 0,
                            'count': 0,
                            'name': all_prices.get(sym, {}).get('name', sym)
                        }
                    
                    stock_yield_agg[sym]['sum_yield'] += item_yield
                    stock_yield_agg[sym]['count'] += 1
        
        held_stock_yield_list = []
        for symbol, agg in stock_yield_agg.items():
            avg_yield = agg['sum_yield'] / agg['count'] if agg['count'] > 0 else 0
            held_stock_yield_list.append({
                'symbol': symbol,
                'name': agg['name'],
                'yield': round(avg_yield, 2)
            })
        
        # Sort for Top 10
        held_stock_yield_list.sort(key=lambda x: x['yield'], reverse=True)
        top_yielding_stocks = held_stock_yield_list[:10]
        
        # Sort for Worst 10
        held_stock_yield_list.sort(key=lambda x: x['yield'], reverse=False)
        worst_yielding_stocks = held_stock_yield_list[:10]
        
        # 7. Update to Main RTDB
        leaderboard_payload = {
            'updatedAt': datetime.now(MARKET_TZ).isoformat(),
            'stats': {
                'totalPlayers': total_players,
                'averageYield': round(total_yield_sum / total_players, 2) if total_players > 0 else 0,
                'totalMarketCap': round(total_equity_sum, 0),
                'topYieldingStocks': top_yielding_stocks,
                'worstYieldingStocks': worst_yielding_stocks
            },
            'list': rankings
        }
        
        main_db.child('rankings').set(leaderboard_payload)
        print(f"  -> Leaderboard successfully updated and synced to Firestore.")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in leaderboard job: {e}")

def run_manager():
    print("Season 3 Leaderboard Manager started.")
    
    # Initial run
    leaderboard_update_job()
    
    # Schedule based on market hours
    # Market open: 1 min, Market closed: 10 mins
    def setup_schedule():
        is_open = is_kr_market_open()
        schedule.clear('ranking_job')
        
        interval = 1 if is_open else 10
        schedule.every(interval).minutes.do(leaderboard_update_job).tag('ranking_job')
        print(f"Leaderboard schedule updated. Market Open: {is_open}, Interval: {interval}m")

    setup_schedule()
    schedule.every(5).minutes.do(setup_schedule)
    
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    # python -m backend.leaderboard_manager
    run_manager()
