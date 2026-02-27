import time
import random
from datetime import datetime
from firebase_admin import firestore
from .firebase_config import main_db, main_firestore, kospi_db, kosdaq_db
from .fetcher import fetch_stock_chart, MARKET_TZ

# Reward Table
REWARDS = {
    0: 50000,   # Failed at round 1 (Participation)
    1: 100000,  # 1st win
    2: 300000,  # 2nd win
    3: 500000,  # 3rd win
}

def get_reward(wins: int, failed: bool = False) -> int:
    """Calculates reward based on win count and failure state."""
    if not failed:
        if wins <= 3:
            return REWARDS.get(wins, 0)
        return 500000 + (wins - 3) * 100000
    else:
        # If failed
        if wins == 0:
            return REWARDS[0]
        if wins == 1:
            return REWARDS[1]
        if wins == 2:
            return REWARDS[2]
        # Risk logic for wins >= 3
        secured = 500000 + (wins - 3) * 100000
        return secured - 50000

def get_random_top_stock():
    """Fetches a random stock from KOSPI or KOSDAQ (excluding ETF)."""
    valid_stocks = []
    
    # 1. Fetch KOSPI
    kp_data = kospi_db.child('stocks/KOSPI').get()
    if kp_data:
        for symbol, stock_data in kp_data.items():
            if isinstance(stock_data, dict) and 'name' in stock_data:
                stock_data['symbol'] = symbol
                valid_stocks.append(stock_data)
        
    # 2. Fetch KOSDAQ
    kq_data = kosdaq_db.child('stocks/KOSDAQ').get()
    if kq_data:
        for symbol, stock_data in kq_data.items():
            if isinstance(stock_data, dict) and 'name' in stock_data:
                stock_data['symbol'] = symbol
                valid_stocks.append(stock_data)
        
    if not valid_stocks:
        return None
        
    random.shuffle(valid_stocks)
    return valid_stocks[0]
def start_game(uid: str):
    """Initializes a new mini-game session."""
    print(f"  -> Starting Mini-game for {uid}")
    
    # 1. Check Daily Attempts
    today_str = datetime.now(MARKET_TZ).strftime('%Y-%m-%d')
    user_ref = main_firestore.collection('users').document(uid)
    
    user_snap = user_ref.get()
    attempts = 0
    if user_snap.exists:
        user_data = user_snap.to_dict()
        stats_data = user_data.get('minigameStats', {})
        if stats_data.get('lastDate') == today_str:
            attempts = stats_data.get('attempts', 0)
    
    if attempts >= 2:
        main_db.child(f'user_activities/{uid}/minigameRequest').update({
            'status': 'FAILED',
            'errorMessage': '오늘의 도전 횟수(2회)를 모두 소모했습니다.'
        })
        return

    # 2. Pick a random stock
    stock = get_random_top_stock()
    if not stock:
        main_db.child(f'user_activities/{uid}/minigameRequest').update({
            'status': 'FAILED',
            'errorMessage': '종목 데이터를 불러오지 못했습니다.'
        })
        return
    
    symbol = stock['symbol']
    name = stock['name']
    
    # 3. Fetch Historical Data (120 sessions) with retries
    max_retries = 3
    history = None
    target_stock = stock
    
    for i in range(max_retries):
        history = fetch_stock_chart(target_stock['symbol'], page_size=120, page=1)
        if history and len(history) >= 45:
            break
        print(f"  !! Retry {i+1} for starting game ({uid})")
        target_stock = get_random_top_stock()
        if not target_stock: break

    if not history or len(history) < 45:
        main_db.child(f'user_activities/{uid}/minigameRequest').update({
            'status': 'FAILED',
            'errorMessage': '충분한 차트 데이터를 확보하지 못했습니다. 다시 시도해 주세요.'
        })
        return

    symbol = target_stock['symbol']
    name = target_stock['name']

    # 4. Select Window
    # Naver returns latest first. We reverse it in fetcher or here?
    # fetch_stock_chart returns [Date, O, H, L, C, V]
    # Let's assume Naver order (latest first) or reversed.
    # Actually fetcher doesn't reverse. It returns as is.
    # Let's reverse to make it chronological.
    history.reverse()
    
    max_start = len(history) - 41
    start_idx = random.randint(0, max_start)
    window_data = history[start_idx : start_idx + 40]
    answer_candle = history[start_idx + 40] # The 41st candle
    
    # Calculate direction: 1 for UP, -1 for DOWN, 0 for FLAT
    direction = 1 if answer_candle[4] > answer_candle[1] else -1
    if answer_candle[4] == answer_candle[1]: direction = 0 # Do it as fail or neutral? User said UP/DOWN.
    
    # 5. Store Session Data securely
    session_id = f"{int(time.time())}"
    main_db.child(f'user_activities/{uid}/minigameData').set({
        'sessionId': session_id,
        'window': window_data,
        'answer': {
            'direction': direction,
            'symbol': symbol,
            'name': name,
            'date': answer_candle[0],
            'details': answer_candle
        },
        'wins': 0,
        'securedReward': get_reward(0),
        'status': 'ACTIVE'
    })
    
    # Update Daily Attempts in User Document
    user_ref.update({
        'minigameStats': {
            'lastDate': today_str,
            'attempts': attempts + 1
        }
    })

    print(f"  -> {uid} Session Created: {session_id} with {name}")
    
    # 6. Update Request status
    main_db.child(f'user_activities/{uid}/minigameRequest').update({
        'status': 'SUCCESS', # Use SUCCESS to indicate readiness
        'sessionId': session_id
    })

def handle_guess(uid: str, guess_data: dict):
    """Processes a user's guess (UP or DOWN)."""
    guess = guess_data.get('guess') # 1 or -1
    session_ref = main_db.child(f'user_activities/{uid}/minigameData')
    session_data = session_ref.get()
    
    if not session_data or session_data.get('status') != 'ACTIVE':
        return

    answer_data = session_data.get('answer')
    # direction: 1 (UP), -1 (DOWN)
    is_correct = (guess == answer_data['direction'])
    
    wins = session_data.get('wins', 0)
    new_wins = wins + 1 if is_correct else wins
    
    # Detailed result for the modal
    round_result = {
        'isCorrect': is_correct,
        'userGuess': guess,
        'answerDirection': answer_data['direction'],
        'stockName': answer_data['name'],
        'date': answer_data['date'],
        'ohlc': {
            'open': answer_data['details'][1],
            'high': answer_data['details'][2],
            'low': answer_data['details'][3],
            'close': answer_data['details'][4]
        }
    }

    if is_correct:
        secured = get_reward(new_wins, failed=False)
        # Update session with result and wait for user to click "Next"
        session_ref.update({
            'wins': new_wins,
            'securedReward': secured,
            'lastRoundResult': round_result,
            'status': 'ROUND_COMPLETED' # Frontend shows modal
        })
        print(f"  -> {uid} Correct! Round {new_wins} Completed.")
    else:
        # FAILED
        final_reward = get_reward(wins, failed=True)
        # For failure, we can go straight to FINISHED but provide lastRoundResult
        # Or ROUND_COMPLETED then FINISHED. Let's do FINISHED with result.
        finalize_game(uid, wins, final_reward, success=False, answer=answer_data, last_result=round_result)

def prepare_next_round(uid: str, wins: int, secured: int):
    """Pick a new stock and window for the next round."""
    # Try up to 3 times to get a valid stock with history
    max_retries = 3
    history = None
    target_stock = get_random_top_stock() # Fix: use get_random_top_stock() instead of undefined stock

    for i in range(max_retries):
        history = fetch_stock_chart(target_stock['symbol'], page_size=120, page=1)
        if history and len(history) >= 45:
            break
        print(f"  !! Retry {i+1} for next round ({uid})")
        target_stock = get_random_top_stock()

    if not history or len(history) < 45:
        print(f"  !! Failed to fetch history for next round after retries ({uid})")
        main_db.child(f'user_activities/{uid}/minigameData').update({
            'status': 'FINISHED',
            'errorMessage': '차트 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
        })
        return

    history.reverse()
    
    max_start = len(history) - 41
    start_idx = random.randint(0, max_start)
    window_data = history[start_idx : start_idx + 40]
    answer_candle = history[start_idx + 40]
    direction = 1 if answer_candle[4] > answer_candle[1] else -1
    
    main_db.child(f'user_activities/{uid}/minigameData').update({
        'window': window_data,
        'answer': {
            'direction': direction,
            'symbol': target_stock['symbol'],
            'name': target_stock['name'],
            'date': answer_candle[0],
            'details': answer_candle
        },
        'wins': wins,
        'securedReward': secured,
        'status': 'ACTIVE',
        'lastRoundResult': None # Clear result for new round
    })
    print(f"  -> {uid} Round {wins+1} Started with {target_stock['name']}.")

def handle_next_round_request(uid: str):
    """Processes user clicking 'Next Round'."""
    session_ref = main_db.child(f'user_activities/{uid}/minigameData')
    session_data = session_ref.get()
    
    if not session_data: return
    
    # If they already reached 3 wins, they might have been in DECIDING state
    # But usually Next Round request comes from ROUND_COMPLETED
    if session_data.get('status') == 'ROUND_COMPLETED':
        wins = session_data.get('wins', 0)
        secured = session_data.get('securedReward', 0)
        
        if wins >= 3:
            # Transition to DECIDING (Stop or Continue)
            # Clear lastRoundResult so it doesn't show up again if they STOP
            session_ref.update({
                'status': 'DECIDING',
                'lastRoundResult': None
            })
        else:
            # Go directly to next round
            prepare_next_round(uid, wins, secured)

def handle_decision(uid: str, decision_data: dict):
    """Handles STOP or CONTINUE decisions."""
    decision = decision_data.get('decision') # 'STOP' or 'CONTINUE'
    session_ref = main_db.child(f'user_activities/{uid}/minigameData')
    session_data = session_ref.get()
    
    if not session_data or session_data.get('status') != 'DECIDING':
        return

    wins = session_data['wins']
    secured = session_data['securedReward']
    
    if decision == 'STOP':
        finalize_game(uid, wins, secured, success=True)
    else:
        # CONTINUE
        print(f"  -> {uid} Chose to CONTINUE at {wins} wins.")
        prepare_next_round(uid, wins, secured)

def finalize_game(uid: str, wins: int, reward: int, success: bool, answer: dict = None, last_result: dict = None):
    """Awards points and ends the session."""
    print(f"  -> Finalizing game for {uid}: {wins} wins, {reward} points.")
    
    # 1. Update Firestore (Points)
    user_ref = main_firestore.collection('users').document(uid)
    
    # Record to history
    @firestore.transactional
    def update_points(transaction):
        transaction.update(user_ref, {
            'taxPoints': firestore.Increment(reward)
        })
        # Add to history
        hist_ref = user_ref.collection('history').document()
        transaction.set(hist_ref, {
            'symbol': 'MINIGAME',
            'name': '미니게임 보상',
            'type': 'REWARD',
            'price': 0,
            'quantity': 1,
            'totalAmount': reward,
            'fee': 0,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'details': f"{wins}연승 보상"
        })

    transaction = main_firestore.transaction()
    update_points(transaction)

    # 2. Update RTDB status for Frontend
    session_ref = main_db.child(f'user_activities/{uid}/minigameData')
    update_pkg = {
        'status': 'FINISHED',
        'finalWins': wins,
        'reward': reward,
        'isSuccess': success
    }
    if last_result:
        update_pkg['lastRoundResult'] = last_result
    elif answer:
        update_pkg['lastAnswer'] = answer
        
    session_ref.update(update_pkg)

def start_manager():
    print("Season 3 Mini-game Manager Daemon Started.")
    
    def on_request(event):
        if event.data is None: return
        path_parts = event.path.strip('/').split('/')
        
        # path_parts could be:
        # 1. ["uid", "minigameRequest"]
        # 2. ["uid"] (if the whole user object is updated)
        # 3. [] (bulk initial load)

        if len(path_parts) == 2 and path_parts[1] == 'minigameRequest':
            uid = path_parts[0]
            req = event.data
            if req.get('status') == 'PENDING': start_game(uid)
            elif req.get('status') == 'GUESS_SUBMITTED': handle_guess(uid, req)
            elif req.get('status') == 'DECISION_SUBMITTED': handle_decision(uid, req)
            elif req.get('status') == 'NEXT_ROUND_PENDING': handle_next_round_request(uid)
        
        elif len(path_parts) == 1:
            uid = path_parts[0]
            req = event.data.get('minigameRequest')
            if req:
                if req.get('status') == 'PENDING': start_game(uid)
                elif req.get('status') == 'GUESS_SUBMITTED': handle_guess(uid, req)
                elif req.get('status') == 'DECISION_SUBMITTED': handle_decision(uid, req)
                elif req.get('status') == 'NEXT_ROUND_PENDING': handle_next_round_request(uid)
        
        elif len(path_parts) == 0:
            for uid, user_data in event.data.items():
                if isinstance(user_data, dict):
                    req = user_data.get('minigameRequest')
                    if req and req.get('status') == 'PENDING':
                        start_game(uid)

    main_db.child('user_activities').listen(on_request)
    
    while True:
        time.sleep(1)

if __name__ == "__main__":
    start_manager()
