import sys
import os
import argparse
from datetime import datetime, timezone, timedelta
from firebase_admin import firestore

# Add current directory to path to import mission_manager
sys.path.append(os.path.dirname(__file__))

import mission_manager
from firestore_client import db

def inject_mock_trade(uid, symbol, tx_type, amount, profit=0, market=None, order_type="MARKET"):
    """
    Inject a mock transaction into Firestore for testing.
    """
    tx_ref = db.collection("transactions").document()
    tx_data = {
        "uid": uid,
        "symbol": symbol,
        "name": f"MOCK {symbol}",
        "type": tx_type,
        "price": 10000,
        "quantity": 10,
        "amount": amount,
        "fee": 0,
        "profit": profit,
        "orderType": order_type,
        "timestamp": firestore.SERVER_TIMESTAMP
    }
    if market:
        tx_data["market"] = market
    
    tx_ref.set(tx_data)
    print(f"  -> Injected mock trade: {tx_type} {symbol} (Profit: {profit}, OrderType: {order_type})")

def force_complete_mission(uid, mission_id):
    """
    Force a mission to COMPLETED status regardless of progress.
    """
    today_str = mission_manager.get_today_str()
    mission_doc_ref = db.collection("users").document(uid).collection("missions").document(today_str)
    
    doc = mission_doc_ref.get()
    if not doc.exists:
        print(f"  -> No missions found for user {uid} today. Creating first.")
        missions = mission_manager.generate_daily_missions(uid)
    else:
        missions = doc.to_dict().get("missions", [])

    changed = False
    for m in missions:
        if m["id"] == mission_id or (mission_id == "all"):
            if m["status"] == "IN_PROGRESS":
                m["status"] = "COMPLETED"
                m["current"] = m["target"]
                m["progress"] = 100
                changed = True
                print(f"  -> Force completed mission: {m['id']} ({m['title']})")

    if changed:
        mission_doc_ref.update({
            "missions": missions,
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
    else:
        print(f"  -> No eligible mission found to complete (or already completed/claimed).")

def main():
    parser = argparse.ArgumentParser(description="미션 시스템 테스트 및 디버깅 도구")
    parser.add_argument("uid", help="대상 사용자 UID (또는 'all')")
    parser.add_argument("--force-ids", nargs="+", help="오늘의 미션으로 강제 지정할 미션 ID 목록")
    parser.add_argument("--complete-id", help="즉시 완료 처리할 미션 ID (또는 'all')")
    parser.add_argument("--mock-trade", choices=["BUY", "SELL", "SHORT", "COVER"], help="가상 거래 유형 주입")
    parser.add_argument("--symbol", default="005930", help="가상 거래 종목 (기본: 삼성전자)")
    parser.add_argument("--profit", type=int, default=0, help="가상 거래 수익액")
    parser.add_argument("--amount", type=int, default=1000000, help="가상 거래 금액")
    parser.add_argument("--order-type", choices=["MARKET", "LIMIT"], default="MARKET", help="가상 거래 주문 유형")
    parser.add_argument("--market", help="가상 거래 시장 (KOSPI, KOSDAQ, US)")

    args = parser.parse_args()
    target_uid = args.uid

    if target_uid == "all":
        uids = [u.id for u in db.collection("users").stream()]
    else:
        uids = [target_uid]

    for uid in uids:
        print(f"\n[User: {uid}] 작업 시작...")
        
        # 1. Inject Mock Trade if requested
        if args.mock_trade:
            inject_mock_trade(uid, args.symbol, args.mock_trade, args.amount, args.profit, args.market, args.order_type)

        # 2. Generate Missions (Force IDs if provided)
        mission_manager.generate_daily_missions(uid, force_ids=args.force_ids)
        
        # 3. Force Complete if requested
        if args.complete_id:
            force_complete_mission(uid, args.complete_id)
        else:
            # Otherwise just update progress naturally
            mission_manager.update_mission_progress(uid)

    print("\n[완료] 모든 요청된 작업이 마무리되었습니다.")

if __name__ == "__main__":
    main()
