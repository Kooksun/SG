import sys
import argparse
from datetime import datetime
from typing import List, Dict, Any

from .firebase_config import main_firestore
from .supabase_client import get_supabase
from .fetcher import MARKET_TZ
from .trade_engine import get_latest_price

BOTS = [
    {"uid": "bot_buffett", "displayName": "워런 버핏 (AI)"},
    {"uid": "bot_bulnabang", "displayName": "불나방 (AI)"},
    {"uid": "bot_safety", "displayName": "안전지구 (AI)"}
]

def show_bot_info(index: int, limit: int = 10):
    if index < 0 or index >= len(BOTS):
        print(f"Error: Invalid index {index}. Choose between 0 and {len(BOTS)-1}.")
        print("Available Bots:")
        for i, b in enumerate(BOTS):
            print(f" [{i}] {b['displayName']} ({b['uid']})")
        return

    bot = BOTS[index]
    uid = bot["uid"]
    
    print("=" * 60)
    print(f" AI BOT INFO: {bot['displayName']} ({uid})")
    print("=" * 60)
    
    # 1. Fetch Firestore Data
    user_ref = main_firestore.collection('users').document(uid)
    doc = user_ref.get()
    if not doc.exists:
        print(f"Error: Bot {uid} not found in Firestore.")
        return
    
    data = doc.to_dict()
    print(f" [Account]")
    print(f"  - Balance: {data.get('balance', 0):,.0f} KRW")
    print(f"  - Persona: {data.get('persona', 'N/A')}")
    print(f"  - Created: {data.get('createdAt')}")
    
    # 2. Portfolio
    print(f"\n [Portfolio]")
    portfolio_ref = user_ref.collection('portfolio')
    holdings = portfolio_ref.stream()
    has_holdings = False
    for h in holdings:
        has_holdings = True
        d = h.to_dict()
        symbol = d.get('symbol')
        qty = d.get('quantity', 0)
        avg = d.get('averagePrice', 0)
        
        price, _, _ = get_latest_price(symbol)
        current_val = price * qty
        pnl = current_val - (avg * qty)
        pnl_pct = ((price - avg) / avg * 100) if avg > 0 else 0
        
        print(f"  - {d.get('name')} ({symbol}): {qty}주 | 평단 {avg:,.0f}원 | 현재 {price:,.0f}원 | 수익률: {pnl_pct:+.2f}% ({pnl:+,.0f}원)")
    
    if not has_holdings:
        print("  - 보유 종목 없음")

    # 3. Trade History from Supabase
    print(f"\n [Recent Trade Records (Last {limit})]")
    try:
        supabase = get_supabase()
        if not supabase:
            print("  - Error: Supabase client initialization failed.")
            return

        response = supabase.table('trade_records') \
                           .select('*') \
                           .eq('uid', uid) \
                           .order('timestamp', desc=True) \
                           .limit(limit) \
                           .execute()
        
        records = response.data
        if not records:
            print("  - 거래 기록 없음")
        else:
            for d in records:
                ts_str = d.get('timestamp')
                # Parse ISO format and convert to KST
                if ts_str:
                    try:
                        # Handle potential timezone strings from Supabase (usually UTC)
                        ts_obj = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                        ts_kst = ts_obj.astimezone(MARKET_TZ)
                        ts = ts_kst.strftime('%Y-%m-%d %H:%M:%S')
                    except Exception:
                        ts = str(ts_str)[:19]
                else:
                    ts = "Unknown"

                side = d.get('type')
                # Use stock_name explicitly, fall back to name or symbol
                name = d.get('stock_name') or d.get('name') or d.get('symbol') or 'Unknown'
                symbol = d.get('symbol')
                price = float(d.get('price', 0))
                qty = float(d.get('quantity', 0))
                profit = float(d.get('profit') or 0)
                
                p_str = f" | 수익: {profit:+,.0f}" if side == 'SELL' else ""
                print(f"  [{ts}] {side} {name}({symbol}) | {qty}주 @ {price:,.0f}원{p_str}")

    except Exception as e:
        print(f"  - Error fetching Supabase records: {e}")
            
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="StockGame AI Bot Manager Tool")
    parser.add_argument("index", type=int, help="Index of the bot (0, 1, 2)")
    parser.add_argument("--limit", type=int, default=10, help="Number of trade records to show")
    
    args = parser.parse_args()
    show_bot_info(args.index, args.limit)
