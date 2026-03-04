import schedule
import time
from datetime import datetime
from .firebase_config import main_db, main_firestore, kospi_db, kosdaq_db, ranking_db
from .fetcher import MARKET_TZ
from .price_updater import is_kr_market_open

def get_all_prices():
    """Fetch all prices from KOSPI/KOSDAQ RTDBs to use as a local cache."""
    prices = {}
    
    # 1. KOSPI project (KOSPI + ETF)
    # The structure is now: stocks/KOSPI/{symbol} and stocks/ETF/{symbol}
    kp_raw = kospi_db.child('stocks').get() or {}
    for market in ['KOSPI', 'ETF']:
        prices.update(kp_raw.get(market, {}))
    
    # 2. KOSDAQ project (KOSDAQ)
    # The structure is now: stocks/KOSDAQ/{symbol}
    kd_raw = kosdaq_db.child('stocks').get() or {}
    prices.update(kd_raw.get('KOSDAQ', {}))
    
    return prices

def leaderboard_update_job():
    print(f"[{datetime.now(MARKET_TZ)}] Calculating Leaderboard (Zero-Read Optimization)...")
    
    # 1. Get all current prices
    all_prices = get_all_prices()
    
    # 2. Get all users from RTDB Cache (Zero Firestore Reads!)
    try:
        ranking_cache = main_db.child('ranking_cache').get() or {}
        
        rankings = []
        stock_yield_agg = {} # {symbol: {'sum_yield': 0, 'count': 0, 'name': ''}}
        
        total_equity_sum = 0
        total_yield_sum = 0
        total_players = 0
        
        for uid, user_data in ranking_cache.items():
            total_players += 1
            
            # 3. Calculate Portfolio Value
            portfolio_value = 0
            stock_count = 0
            portfolio = user_data.get('portfolio', {})
            
            for symbol, p_data in portfolio.items():
                qty = float(p_data.get('quantity', 0))
                avg_price = float(p_data.get('averagePrice', 0))
                
                live_price = float(all_prices.get(symbol, {}).get('price', avg_price))
                portfolio_value += (qty * live_price)
                if qty > 0: 
                    stock_count += 1
                    if symbol and avg_price > 0:
                        item_yield = ((live_price / avg_price) - 1) * 100
                        if symbol not in stock_yield_agg:
                            stock_yield_agg[symbol] = {
                                'sum_yield': 0, 'count': 0,
                                'name': all_prices.get(symbol, {}).get('name', symbol)
                            }
                        stock_yield_agg[symbol]['sum_yield'] += item_yield
                        stock_yield_agg[symbol]['count'] += 1

            # 4. Use cached data
            cash = float(user_data.get('balance', 0))
            display_name = user_data.get('displayName', 'Anonymous')
            photo_url = user_data.get('photoURL', '')
            starting_balance = float(user_data.get('startingBalance', 300000000.0))
            
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
            
            # Update RTDB live stats for Frontend instead of Firestore update
            main_db.child(f'users/{uid}/live_stats').update({
                'totalStockValue': round(portfolio_value, 2),
                'totalEquity': round(total_equity, 2),
                'pnlRate': round(yield_percent, 2),
                'stockCount': stock_count,
                'lastCalculatedAt': datetime.now(MARKET_TZ).isoformat()
            })
            
        # 4. Sort by Equity descending
        rankings.sort(key=lambda x: x['equity'], reverse=True)
        
        # 5. Add Rank
        for i, item in enumerate(rankings):
            item['rank'] = i + 1
            
        # 6. Process Top/Worst Stocks by Yield
        held_stock_yield_list = []
        for symbol, agg in stock_yield_agg.items():
            avg_yield = agg['sum_yield'] / agg['count'] if agg['count'] > 0 else 0
            held_stock_yield_list.append({
                'symbol': symbol,
                'name': agg['name'],
                'yield': round(avg_yield, 2)
            })
        
        held_stock_yield_list.sort(key=lambda x: x['yield'], reverse=True)
        top_yielding_stocks = held_stock_yield_list[:10]
        
        held_stock_yield_list.sort(key=lambda x: x['yield'], reverse=False)
        worst_yielding_stocks = held_stock_yield_list[:10]
        
        # 7. Update to Ranking RTDB
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
        
        ranking_db.child('rankings').set(leaderboard_payload)
        print(f"  -> Leaderboard successfully updated to Ranking Project.")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in leaderboard job: {e}")

def run_manager():
    print("Season 3 Leaderboard Manager started.")
    
    # Initial run
    leaderboard_update_job()
    
    # Track the current operational mode
    current_market_open = None

    # Schedule based on market hours
    # Market open: 1 min, Market closed: 10 mins
    def setup_schedule():
        nonlocal current_market_open
        is_open = is_kr_market_open()

        if current_market_open == is_open:
            return # No change needed
        
        schedule.clear('ranking_job')
        
        interval = 1 if is_open else 10
        schedule.every(interval).minutes.do(leaderboard_update_job).tag('ranking_job')
        current_market_open = is_open
        print(f"Leaderboard schedule updated. Market Open: {is_open}, Interval: {interval}m")

    setup_schedule()
    
    # 2. Add Realtime Listener for immediate updates
    # This allows frontend to trigger calculation after certain actions (e.g. sign up)
    def on_trigger_change(event):
        if event.data:
            print(f"[{datetime.now(MARKET_TZ)}] Immediate update triggered via RTDB!")
            leaderboard_update_job()

    trigger_ref = main_db.child('commands/updateLeaderboard')
    trigger_ref.listen(on_trigger_change)
    print("Leaderboard Immediate Trigger Listener active.")

    # Check for schedule change every 60 minutes (instead of 5, as we have a listener)
    schedule.every(60).minutes.do(setup_schedule)
    
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    # python -m backend.leaderboard_manager
    run_manager()
