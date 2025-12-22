import random
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from firebase_admin import firestore
from firestore_client import db

# Mission Types and their configurations
MISSION_POOL = [
    {
        "id": "active_trader",
        "title": "적극적 거래자",
        "description": "오늘 총 5회 이상 거래하세요.",
        "category": "trading",
        "target": 5,
        "reward": 2000,
    },
    {
        "id": "diversified_investor",
        "title": "다각화 투자",
        "description": "오늘 3개 이상의 서로 다른 종목을 매수하세요.",
        "category": "trading",
        "target": 3,
        "reward": 3000,
    },
    {
        "id": "us_market_explorer",
        "title": "시장 탐험",
        "description": "미국 주식을 1회 이상 거래하세요.",
        "category": "trading",
        "target": 1,
        "reward": 2500,
    },
    {
        "id": "kosdaq_hunter",
        "title": "코스닥 사냥꾼",
        "description": "코스닥(KOSDAQ) 종목을 2회 이상 거래하세요.",
        "category": "trading",
        "target": 2,
        "reward": 2000,
    },
    {
        "id": "kospi_lover",
        "title": "대형주 사랑",
        "description": "코스피(KOSPI) 종목을 2회 이상 매수하세요.",
        "category": "trading",
        "target": 2,
        "reward": 1500,
    },
    {
        "id": "profit_taste",
        "title": "수익의 맛",
        "description": "오늘 실현 손익 1,000,000원 이상을 달성하세요.",
        "category": "profit",
        "target": 1000000,
        "reward": 3000,
    },
    {
        "id": "perfect_sell",
        "title": "익절의 습관",
        "description": "수익률 +3% 이상에서 매도에 1회 성공하세요.",
        "category": "profit",
        "target": 1,
        "reward": 2000,
    },
    {
        "id": "risk_management",
        "title": "손절의 용기",
        "description": "손실 중인 종목을 매도하여 리스크를 관리하세요 (1회).",
        "category": "profit",
        "target": 1,
        "reward": 1500,
    },
    {
        "id": "jackpot_dream",
        "title": "대박의 꿈",
        "description": "단일 거래로 5,000,000원 이상의 수익을 달성하세요.",
        "category": "profit",
        "target": 5000000,
        "reward": 5000,
    },
    {
        "id": "steady_profit",
        "title": "꾸준한 수익",
        "description": "오늘 거래한 종목 중 70% 이상이 수익으로 종료되게 하세요. (최소 3회 거래 필요)",
        "category": "profit",
        "target": 70,
        "reward": 4000,
    },
    {
        "id": "bear_market_bet",
        "title": "하락장 베팅",
        "description": "공매도(Short Selling)를 1회 이상 수행하세요.",
        "category": "strategy",
        "target": 1,
        "reward": 2000,
    },
    {
        "id": "short_cover_profit",
        "title": "숏 커버링",
        "description": "공매도 포지션을 수익권에서 청산(Cover)하세요 (1회).",
        "category": "strategy",
        "target": 1,
        "reward": 2500,
    },
    {
        "id": "leverage_master",
        "title": "레버리지 마스터",
        "description": "신용 사용액이 총 자산의 50% 이상에 도달해 보세요.",
        "category": "strategy",
        "target": 50,
        "reward": 3500,
    },
    {
        "id": "limit_order_pro",
        "title": "지정가 고수",
        "description": "지정가 주문(Limit Order)을 체결시켜 보세요 (1회).",
        "category": "strategy",
        "target": 1,
        "reward": 2000,
    },
    {
        "id": "whale_investment",
        "title": "신중한 투자",
        "description": "1억 원 이상의 매수 주문을 1회 수행하세요.",
        "category": "strategy",
        "target": 1,
        "reward": 3000,
    }
]

def get_today_str():
    # Use KST (UTC+9)
    kst = timezone(timedelta(hours=9))
    return datetime.now(kst).strftime("%Y-%m-%d")

def generate_daily_missions(uid: str, force_ids: List[str] = None) -> List[Dict[str, Any]]:
    """
    Generate 3 random missions for the user for today, or force specific ones.
    """
    today_str = get_today_str()
    mission_ref = db.collection("users").document(uid).collection("missions").document(today_str)
    
    doc = mission_ref.get()
    # If not forcing, return existing ones if they exist
    if doc.exists and not force_ids:
        return doc.to_dict().get("missions", [])

    if force_ids:
        selected = [m for m in MISSION_POOL if m["id"] in force_ids]
        # Fill with random if less than 3 forced
        if len(selected) < 3:
            remaining = [m for m in MISSION_POOL if m["id"] not in [s["id"] for s in selected]]
            selected += random.sample(remaining, 3 - len(selected))
    else:
        # Toggle: 샘플링 시 MISSION_POOL의 크기보다 큰 값을 요청하지 않도록 주의
        count = min(3, len(MISSION_POOL))
        selected = random.sample(MISSION_POOL, count)
    missions = []
    for m in selected:
        missions.append({
            **m,
            "current": 0,
            "status": "IN_PROGRESS",
            "progress": 0,
            "updatedAt": datetime.now(timezone.utc)
        })
    
    mission_ref.set({
        "missions": missions,
        "date": today_str,
        "updatedAt": firestore.SERVER_TIMESTAMP
    })
    
    print(f"Generated missions for user {uid} for {today_str}")
    return missions

def update_mission_progress(uid: str):
    """
    Fetch user transactions and other states to update mission progress.
    """
    today_str = get_today_str()
    kst = timezone(timedelta(hours=9))
    # Start of day in KST
    start_time = datetime.now(kst).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # 1. Fetch Today's Transactions
    # Use simple query to avoid composite index requirement
    tx_ref = db.collection("transactions")
    query = tx_ref.where(filter=firestore.FieldFilter("uid", "==", uid)).stream()
    
    transactions = []
    for t in query:
        dt = t.get("timestamp")
        # Handle both datetime objects and strings if any
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
            
        if dt and dt >= start_time:
            transactions.append(t.to_dict())
    
    # 2. Fetch User Info (for leverage check)
    user_doc_snapshot = db.collection("users").document(uid).get()
    if not user_doc_snapshot.exists:
        return
    user_doc = user_doc_snapshot.to_dict()
    
    # 3. Fetch Portfolio (for total asset calculation)
    portfolio_docs = db.collection("users").document(uid).collection("portfolio").stream()
    total_valuation = 0
    for doc in portfolio_docs:
        data = doc.to_dict()
        qty = data.get("quantity", 0)
        price = data.get("currentPrice", 0)
        total_valuation += abs(qty) * price

    total_assets = (user_doc.get("balance", 0) + total_valuation)
    used_credit = user_doc.get("usedCredit", 0)
    leverage_pct = (used_credit / total_assets * 100) if total_assets > 0 else 0

    # 4. Process Missions
    mission_doc_ref = db.collection("users").document(uid).collection("missions").document(today_str)
    doc = mission_doc_ref.get()
    if not doc.exists:
        # Try to generate if not exists (fallback)
        current_missions = generate_daily_missions(uid)
    else:
        current_missions = doc.to_dict().get("missions", [])
        
    if not current_missions:
        return
        
    changed = False

    for m in current_missions:
        if m["status"] == "CLAIMED":
            continue
            
        old_current = m["current"]
        new_current = 0
        
        m_id = m["id"]
        
        # Helper to check if a symbol is US
        def is_us_tx(t):
            m = t.get("market", "")
            if m == "US": return True
            symbol = t.get("symbol", "")
            return not symbol.isdigit()

        if m_id == "active_trader":
            new_current = len(transactions)
        elif m_id == "diversified_investor":
            buy_txs = [t for t in transactions if t["type"] == "BUY"]
            new_current = len(set(t["symbol"] for t in buy_txs))
        elif m_id == "us_market_explorer":
            new_current = len([t for t in transactions if is_us_tx(t)])
        elif m_id == "kosdaq_hunter":
            new_current = len([t for t in transactions if t.get("market") == "KOSDAQ"])
        elif m_id == "kospi_lover":
            # Handle both KOSPI and legacy/fallback KRX
            new_current = len([t for t in transactions if t.get("market") in ["KOSPI", "KRX"] and t["type"] == "BUY"])
        elif m_id == "profit_taste":
            new_current = sum(t.get("profit", 0) for t in transactions)
        elif m_id == "perfect_sell":
            sells = [t for t in transactions if t["type"] in ["SELL", "COVER"]]
            for s in sells:
                cost = s.get("amount", 1) - s.get("profit", 0)
                p_rate = (s.get("profit", 0) / cost) * 100 if cost > 0 else 0
                if p_rate >= 3:
                    new_current = 1
                    break
        elif m_id == "risk_management":
            new_current = 1 if any(t.get("profit", 0) < 0 for t in transactions if t["type"] in ["SELL", "COVER"]) else 0
        elif m_id == "jackpot_dream":
            new_current = max([t.get("profit", 0) for t in transactions] + [0])
        elif m_id == "steady_profit":
            sells = [t for t in transactions if t["type"] in ["SELL", "COVER"]]
            if len(sells) >= 3:
                profit_sells = len([s for s in sells if s.get("profit", 0) > 0])
                new_current = int((profit_sells / len(sells)) * 100)
            else:
                new_current = 0
        elif m_id == "bear_market_bet":
            new_current = 1 if any(t["type"] == "SHORT" for t in transactions) else 0
        elif m_id == "short_cover_profit":
            new_current = 1 if any(t["type"] == "COVER" and t.get("profit", 0) > 0 for t in transactions) else 0
        elif m_id == "leverage_master":
            new_current = int(leverage_pct)
        elif m_id == "limit_order_pro":
            new_current = 1 if any(t.get("orderType") == "LIMIT" for t in transactions) else 0
        elif m_id == "whale_investment":
            new_current = 1 if any(t["type"] == "BUY" and t.get("amount", 0) >= 100_000_000 for t in transactions) else 0

        # Update if progress increased
        if new_current > old_current:
            m["current"] = new_current
            m["progress"] = min(100, int((new_current / m["target"]) * 100))
            if m["progress"] >= 100 and m["status"] == "IN_PROGRESS":
                m["status"] = "COMPLETED"
            changed = True
    
    if changed:
        mission_doc_ref.update({
            "missions": current_missions,
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        print(f"Updated mission progress for user {uid}")

def claim_mission_reward(uid: str, mission_id: str):
    """
    Claim reward for a completed mission.
    """
    today_str = get_today_str()
    mission_doc_ref = db.collection("users").document(uid).collection("missions").document(today_str)
    
    @firestore.transactional
    def _claim(transaction, ref):
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            raise ValueError("Missions for today not found")
            
        data = snapshot.to_dict()
        missions = data.get("missions", [])
        
        mission_index = -1
        for i, m in enumerate(missions):
            if m["id"] == mission_id:
                mission_index = i
                break
        
        if mission_index == -1:
            raise ValueError("Mission not found")
            
        mission = missions[mission_index]
        if mission["status"] != "COMPLETED":
            raise ValueError("Mission not completed or already claimed")
            
        reward = mission["reward"]
        
        # Update user points
        user_ref = db.collection("users").document(uid)
        transaction.update(user_ref, {
            "points": firestore.Increment(reward)
        })
        
        # Update mission status
        mission["status"] = "CLAIMED"
        transaction.update(ref, {
            "missions": missions,
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        
        # Record reward transaction for history
        reward_tx_ref = db.collection("transactions").document()
        transaction.set(reward_tx_ref, {
            "uid": uid,
            "type": "REWARD",
            "points": reward,
            "name": f"미션 보상: {mission['title']}",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return reward

    return _claim(db.transaction(), mission_doc_ref)

if __name__ == "__main__":
    # Test generation
    user_id = "test_user" # Replace with real UID for testing
    generate_daily_missions(user_id)
    update_mission_progress(user_id)
