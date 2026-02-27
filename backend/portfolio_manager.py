import time
import urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo
from firebase_admin import firestore
from .firebase_config import main_db, main_firestore, kospi_db, kosdaq_db
from .email_utils import EmailManager

MARKET_TZ = ZoneInfo("Asia/Seoul")

def get_all_prices():
    """Fetch all prices from KOSPI/KOSDAQ RTDBs to use as a local cache."""
    prices = {}
    kp_raw = kospi_db.child('stocks').get() or {}
    for market in ['KOSPI', 'ETF']:
        prices.update(kp_raw.get(market, {}))
    kd_raw = kosdaq_db.child('stocks').get() or {}
    prices.update(kd_raw.get('KOSDAQ', {}))
    return prices

def process_portfolio_request(uid: str, req: dict):
    print(f"[{datetime.now(MARKET_TZ)}] Processing Portfolio Request from {uid}")
    
    target_uid = req.get('targetUid')
    target_name = req.get('targetName', 'Anonymous')
    
    if not target_uid:
        mark_request_failed(uid, "대상 유저 정보가 누락되었습니다.")
        return

    # 1. Fetch Requesting User
    requester_ref = main_firestore.collection('users').document(uid)
    req_snap = requester_ref.get()
    
    if not req_snap.exists:
        mark_request_failed(uid, "요청자 정보를 찾을 수 없습니다.")
        return
        
    req_data = req_snap.to_dict()
    requester_email = req_data.get('email') # Fallback if possible, but email manager handles it
    tax_points = req_data.get('taxPoints', 0)
    
    if tax_points < 10000:
        mark_request_failed(uid, "포인트가 부족합니다 (10,000 P 필요).")
        return

    # 2. Start Transaction to deduct points
    try:
        @firestore.transactional
        def deduct_points_and_log(transaction):
            snap = requester_ref.get(transaction=transaction)
            current_points = snap.to_dict().get('taxPoints', 0)
            if current_points < 10000:
                raise ValueError("Points insufficient during transaction.")
            
            transaction.update(requester_ref, {
                'taxPoints': firestore.Increment(-10000)
            })
            
            # Add History Log
            hist_ref = requester_ref.collection('history').document()
            transaction.set(hist_ref, {
                'symbol': 'VIEW',
                'name': '포트폴리오 열람',
                'type': 'TAX', # Or FEE
                'price': 0,
                'quantity': 1,
                'totalAmount': -10000,
                'fee': 0,
                'timestamp': firestore.SERVER_TIMESTAMP,
                'details': f"{target_name}님의 포트폴리오 열람 비용"
            })
            
        transaction = main_firestore.transaction()
        deduct_points_and_log(transaction)
    except Exception as e:
        print(f"  !! Transaction failed for {uid}: {e}")
        mark_request_failed(uid, "결제 처리 중 오류가 발생했습니다.")
        return

    print(f"  -> Deducted 10,000 P from {uid}. Fetching portfolio for {target_name} ({target_uid})")

    # 3. Fetch Target Portfolio & Prices
    all_prices = get_all_prices()
    target_portfolio_ref = main_firestore.collection('users').document(target_uid).collection('portfolio')
    portfolio_docs = list(target_portfolio_ref.stream())
    
    portfolio_items = []
    total_val = 0
    total_investment = 0
    
    for item in portfolio_docs:
        p_data = item.to_dict()
        qty = float(p_data.get('quantity', 0))
        if qty <= 0: continue
            
        symbol = p_data.get('symbol')
        avg_price = float(p_data.get('averagePrice', 0))
        
        # Get Live Price
        live_price = float(all_prices.get(symbol, {}).get('price', avg_price))
        stock_name = all_prices.get(symbol, {}).get('name', symbol)
        
        eval_amount = qty * live_price
        invest_amount = qty * avg_price
        
        total_val += eval_amount
        total_investment += invest_amount
        
        yield_pct = ((live_price / avg_price) - 1) * 100 if avg_price > 0 else 0
        
        portfolio_items.append({
            'symbol': symbol,
            'name': stock_name,
            'qty': qty,
            'avg_price': avg_price,
            'live_price': live_price,
            'eval_amount': eval_amount,
            'yield': yield_pct
        })
        
    # Sort by Evaluation Amount descending
    portfolio_items.sort(key=lambda x: x['eval_amount'], reverse=True)
    
    total_yield = ((total_val / total_investment) - 1) * 100 if total_investment > 0 else 0

    # 4. Generate Email HTML
    html_content = f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 10px;">
        <h2 style="color: #1f2937; text-align: center; margin-bottom: 20px;">📊 {target_name}님의 포트폴리오 리포트</h2>
        
        <div style="background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 24px;">
            <p style="margin: 0; color: #4b5563; font-size: 14px;">총 주식 평가 금액</p>
            <h3 style="margin: 8px 0 0 0; color: #1f2937; font-size: 24px;">{total_val:,.0f} 원</h3>
            <p style="margin: 8px 0 0 0; font-size: 15px; font-weight: bold; color: {'#ef4444' if total_yield < 0 else '#10b981'};">
                종합 수익률: {total_yield:+.2f}%
            </p>
        </div>
        
        <h4 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">보유 종목 상세 ({len(portfolio_items)}종목)</h4>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; background-color: white; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
            <thead>
                <tr style="background-color: #f3f4f6;">
                    <th style="padding: 12px 8px; text-align: left; color: #4b5563; font-size: 13px;">종목/수량</th>
                    <th style="padding: 12px 8px; text-align: right; color: #4b5563; font-size: 13px;">평가액/수익률</th>
                </tr>
            </thead>
            <tbody>
    """
    
    if not portfolio_items:
        html_content += """
            <tr>
                <td colspan="2" style="padding: 20px; text-align: center; color: #6b7280;">보유 중인 주식이 없습니다.</td>
            </tr>
        """
    else:
        for item in portfolio_items:
            yield_color = '#ef4444' if item['yield'] < 0 else '#10b981'
            html_content += f"""
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px 8px;">
                        <div style="font-weight: bold; color: #1f2937;">{item['name']}</div>
                        <div style="color: #6b7280; font-size: 12px; margin-top: 4px;">{item['qty']:,.0f}주 (@ {item['avg_price']:,.0f}원)</div>
                    </td>
                    <td style="padding: 12px 8px; text-align: right;">
                        <div style="font-weight: bold; color: #1f2937;">{item['eval_amount']:,.0f}원</div>
                        <div style="color: {yield_color}; font-size: 13px; font-weight: 500; margin-top: 4px;">
                            {item['yield']:+.2f}%
                        </div>
                    </td>
                </tr>
            """
            
    html_content += """
            </tbody>
        </table>
        
        <div style="margin-top: 30px; text-align: center; color: #9ca3af; font-size: 12px;">
            본 리포트는 요청 시점의 데이터를 기반으로 생성되었습니다.<br>
            © Season 3 Stock Game
        </div>
    </div>
    """

    # 5. Send Email
    subject = f"[{target_name}] 포트폴리오 상세 분석 리포트"
    email_mgr = EmailManager()
    
    try:
        success = email_mgr.send_game_report(uid, subject, html_content)
        if success:
            main_db.child(f'user_activities/{uid}/portfolioRequest').update({
                'status': 'SUCCESS'
            })
            print(f"  -> Email successfully sent to {uid}")
        else:
            mark_request_failed(uid, "이메일 발송에 실패했습니다.") # E.g. Missing auth email
            # Do we refund? For now, no refund implemented.
    except Exception as e:
        print(f"  !! Email error: {e}")
        mark_request_failed(uid, "이메일 시스템 연결 오류가 발생했습니다.")


def mark_request_failed(uid: str, msg: str):
    main_db.child(f'user_activities/{uid}/portfolioRequest').update({
        'status': 'FAILED',
        'errorMessage': msg
    })

def start_manager():
    print("Season 3 Portfolio Request Manager Started.")
    
    def on_request(event):
        if event.data is None: return
        path_parts = event.path.strip('/').split('/')
        
        if len(path_parts) == 2 and path_parts[1] == 'portfolioRequest':
            uid = path_parts[0]
            req = event.data
            if req.get('status') == 'PENDING': 
                process_portfolio_request(uid, req)
                
        elif len(path_parts) == 1:
            uid = path_parts[0]
            req = event.data.get('portfolioRequest')
            if req and req.get('status') == 'PENDING':
                process_portfolio_request(uid, req)
                
        elif len(path_parts) == 0:
            for uid, user_data in event.data.items():
                if isinstance(user_data, dict):
                    req = user_data.get('portfolioRequest')
                    if req and req.get('status') == 'PENDING':
                        process_portfolio_request(uid, req)

    main_db.child('user_activities').listen(on_request)
    
    while True:
        time.sleep(1)

if __name__ == "__main__":
    start_manager()
