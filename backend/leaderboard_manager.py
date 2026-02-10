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
        initial_balance = 100000000.0 # Default starting asset (100M KRW)
        
        # Aggregate stats
        total_equity_sum = 0
        total_yield_sum = 0
        aggregate_portfolio = {} # {symbol: {name: str, value: float}}
        
        user_list = list(users_docs)
        total_players = len(user_list)
        
        for user_doc in user_list:
            uid = user_doc.id
            user_data = user_doc.to_dict()
            
            cash = float(user_data.get('balance', 0))
            display_name = user_data.get('displayName', 'Anonymous')
            photo_url = user_data.get('photoURL', '')
            
            # 3. Calculate Portfolio Value
            portfolio_value = 0
            portfolio_ref = users_ref.document(uid).collection('portfolio')
            portfolio_items = portfolio_ref.stream()
            
            for item in portfolio_items:
                p_data = item.to_dict()
                symbol = p_data.get('symbol')
                name = p_data.get('name', symbol)
                qty = float(p_data.get('quantity', 0))
                
                # Use live price if available, else use avg price as fallback
                live_price = float(all_prices.get(symbol, {}).get('price', p_data.get('averagePrice', 0)))
                item_market_value = (qty * live_price)
                portfolio_value += item_market_value
                
                # Global Portfolio Aggregation
                if symbol not in aggregate_portfolio:
                    aggregate_portfolio[symbol] = {'name': name, 'value': 0}
                aggregate_portfolio[symbol]['value'] += item_market_value
            
            total_equity = cash + portfolio_value
            yield_percent = ((total_equity - initial_balance) / initial_balance) * 100 if initial_balance > 0 else 0
            
            total_equity_sum += total_equity
            total_yield_sum += yield_percent
            
            rankings.append({
                'uid': uid,
                'displayName': display_name,
                'photoURL': photo_url,
                'equity': round(total_equity, 2),
                'yield': round(yield_percent, 2),
                'cash': round(cash, 2),
                'stockValue': round(portfolio_value, 2)
            })
            
        # 4. Sort by Equity descending
        rankings.sort(key=lambda x: x['equity'], reverse=True)
        
        # 5. Add Rank
        for i, item in enumerate(rankings):
            item['rank'] = i + 1
            
        # 6. Process Aggregate Portfolio (Top 10)
        top_holdings = []
        for sym, data in aggregate_portfolio.items():
            top_holdings.append({'symbol': sym, 'name': data['name'], 'value': round(data['value'], 0)})
        top_holdings.sort(key=lambda x: x['value'], reverse=True)
        top_holdings = top_holdings[:10]
        
        # 7. Update to Main RTDB
        main_db.child('rankings').set({
            'updatedAt': datetime.now(MARKET_TZ).isoformat(),
            'stats': {
                'totalPlayers': total_players,
                'averageYield': round(total_yield_sum / total_players, 2) if total_players > 0 else 0,
                'totalMarketCap': round(total_equity_sum, 0),
                'topHoldings': top_holdings
            },
            'list': rankings[:100] # Top 100 only for performance
        })
        print(f"  -> Leaderboard updated. {len(rankings)} users ranked. Stats & Top Holdings computed.")
        
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
