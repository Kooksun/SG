import time
import math
import random
import urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo
from firebase_admin import firestore
from .firebase_config import main_db, main_firestore, kospi_db, kosdaq_db, sync_user_to_rtdb
from .email_utils import EmailManager

MARKET_TZ = ZoneInfo("Asia/Seoul")
MAX_TICKERS = 50

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
    
    # Sync requester to RTDB Cache for point update
    sync_user_to_rtdb(uid)

    # 3. Fetch Target User Data & Portfolio & Prices
    target_ref = main_firestore.collection('users').document(target_uid)
    target_snap = target_ref.get()
    
    target_balance = 0
    if target_snap.exists:
        target_balance = float(target_snap.to_dict().get('balance', 0))

    all_prices = get_all_prices()
    target_portfolio_ref = target_ref.collection('portfolio')
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
    total_assets = total_val + target_balance

    # 4. Generate Email HTML
    html_content = f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 10px;">
        <h2 style="color: #1f2937; text-align: center; margin-bottom: 20px;">📊 {target_name}님의 포트폴리오 리포트</h2>
        
        <div style="background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f3f4f6; padding-bottom: 12px; margin-bottom: 12px;">
                <div style="text-align: left;">
                    <p style="margin: 0; color: #4b5563; font-size: 13px;">총 주식 평가액</p>
                    <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 18px; font-weight: bold;">{total_val:,.0f} 원</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; color: #4b5563; font-size: 13px;">현금 잔고</p>
                    <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 18px; font-weight: bold;">{target_balance:,.0f} 원</p>
                </div>
            </div>
            
            <p style="margin: 0; color: #4b5563; font-size: 14px;">총 자산 (평가액 + 현금)</p>
            <h3 style="margin: 8px 0 0 0; color: #1f2937; font-size: 28px;">{total_assets:,.0f} 원</h3>
            <p style="margin: 8px 0 0 0; font-size: 15px; font-weight: bold; color: {'#ef4444' if total_yield < 0 else '#10b981'};">
                종합 수익률 (주식): {total_yield:+.2f}%
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


def mark_request_failed(uid: str, msg: str, req_type: str = 'portfolioRequest'):
    main_db.child(f'user_activities/{uid}/{req_type}').update({
        'status': 'FAILED',
        'errorMessage': msg
    })

def broadcast_sabotage_ticker(attacker_name, target_name, symbol, name, tx_type, amount):
    """Broadcasts sabotage event to Main RTDB system/tickers."""
    try:
        ticker_ref = main_db.child('system/tickers')
        current_tickers = ticker_ref.child('list').get() or []
        
        new_ticker = {
            "displayName": attacker_name,
            "targetName": target_name,
            "symbol": symbol,
            "name": name,
            "type": tx_type, # 'SABOTAGE_BUY' or 'SABOTAGE_SELL'
            "amount": float(amount),
            "timestamp": datetime.now(MARKET_TZ).isoformat()
        }
        
        # Prepend and slice
        updated_list = [new_ticker] + current_tickers
        updated_list = updated_list[:MAX_TICKERS]
        
        ticker_ref.set({
            "list": updated_list,
            "lastUpdate": datetime.now(MARKET_TZ).isoformat()
        })
        
        print(f"  [SABOTAGE TICKER] Broadcasted: {attacker_name} attacked {target_name} | {tx_type} {name}")
    except Exception as e:
        print(f"Error broadcasting sabotage ticker: {e}")

def process_sabotage_request(uid: str, req: dict):
    print(f"[{datetime.now(MARKET_TZ)}] Processing Sabotage Request from {uid}")
    
    target_uid = req.get('targetUid')
    target_name = req.get('targetName', 'Anonymous')
    
    if not target_uid:
        mark_request_failed(uid, "대상 유저 정보가 누락되었습니다.", 'sabotageRequest')
        return

    # 1. Fetch Requesting User to get nickname (optional, might use Anonymous)
    requester_ref = main_firestore.collection('users').document(uid)
    req_snap = requester_ref.get()
    
    if not req_snap.exists:
        mark_request_failed(uid, "요청자 정보를 찾을 수 없습니다.", 'sabotageRequest')
        return
        
    req_data = req_snap.to_dict()
    requester_name = req_data.get('displayName', '익명 플레이어')
    requester_email = req_data.get('email')
    tax_points = req_data.get('taxPoints', 0)
    
    if tax_points < 100000:
        mark_request_failed(uid, "포인트가 부족합니다 (100,000 P 필요).", 'sabotageRequest')
        return

    # 2. Pick target's largest holding or penny stock based on type
    attack_type = req.get('type', 'FORCED_SALE') # Use req directly for type
    
    all_prices = get_all_prices() # Fetch all prices once
    
    largest_stock = None
    selected_penny = None

    target_ref = main_firestore.collection('users').document(target_uid) # Define target_ref here

    if attack_type == 'FORCED_SALE':
        target_portfolio_ref = target_ref.collection('portfolio')
        stock_snaps = target_portfolio_ref.stream()
        
        for snap in stock_snaps:
            stock_data = snap.to_dict()
            symbol = snap.id
            qty = float(stock_data.get('quantity', 0))
            if qty <= 0: continue
            
            # Use cached price if available
            live_price = all_prices.get(symbol, {}).get('price', 0) # Use all_prices
            stock_name = stock_data.get('name', symbol)
            
            eval_amount = qty * live_price
            if not largest_stock or eval_amount > (largest_stock['quantity'] * largest_stock['live_price']):
                largest_stock = {
                    'symbol': symbol,
                    'name': stock_name,
                    'quantity': qty,
                    'live_price': live_price
                }
                
        if not largest_stock:
            mark_request_failed(uid, "대상이 보유한 주식이 없습니다.", 'sabotageRequest')
            return
            
    elif attack_type == 'PENNY_STOCK_ATTACK':
        # Fetch bottom 50 penny stocks
        all_stocks = []
        for symbol, data in all_prices.items(): # Use all_prices
            price = data.get('price', 0)
            if price > 0:
                all_stocks.append({
                    'symbol': symbol,
                    'name': data.get('name', 'Unknown'),
                    'price': price
                })
        
        if not all_stocks:
            mark_request_failed(uid, "종목 데이터를 불러올 수 없습니다.", 'sabotageRequest')
            return
            
        # Sort by price ascending and take bottom 50
        all_stocks.sort(key=lambda x: x['price'])
        penny_candidates = all_stocks[:50]
        selected_penny = random.choice(penny_candidates)

    hist_req_ref = requester_ref.collection('history').document()
    hist_tgt_ref = target_ref.collection('history').document()
    
    if attack_type == 'FORCED_SALE':
        tgt_stock_doc = target_ref.collection('portfolio').document(largest_stock['symbol'])
    else:
        tgt_stock_doc = target_ref.collection('portfolio').document(selected_penny['symbol'])

    # 3. Transaction
    try:
        @firestore.transactional
        def execute_sabotage(transaction):
            # Reads
            req_snap_tx = requester_ref.get(transaction=transaction)
            tgt_snap_tx = target_ref.get(transaction=transaction)
            stock_snap_tx = tgt_stock_doc.get(transaction=transaction)

            if not req_snap_tx.exists or not tgt_snap_tx.exists:
                return False, "유저 데이터를 찾을 수 없습니다."

            req_pts = req_snap_tx.to_dict().get('taxPoints', 0)
            if req_pts < 100000:
                return False, "포인트가 부족합니다."

            tgt_cash = tgt_snap_tx.to_dict().get('balance', 0)
            tgt_email = tgt_snap_tx.to_dict().get('email')

            if attack_type == 'FORCED_SALE':
                if not stock_snap_tx.exists:
                    return False, "대상이 보유한 주식이 없습니다."

                stock_data = stock_snap_tx.to_dict()
                current_qty = float(stock_data.get('quantity', 0))
                if current_qty < 1:
                    return False, "대상의 주식 수량이 부족합니다."

                # FORCED SALE LOGIC
                # Math
                sell_qty = max(1, math.floor(current_qty * 0.05))
                sell_amount = sell_qty * largest_stock['live_price']
                new_qty = current_qty - sell_qty
                
                # PnL Calculation
                avg_price = float(stock_data.get('averagePrice', 0))
                profit = (largest_stock['live_price'] - avg_price) * sell_qty if avg_price > 0 else 0
                profitRatio = (largest_stock['live_price'] / avg_price - 1) if avg_price > 0 else 0

                # Writes
                transaction.update(target_ref, {
                    'balance': tgt_cash + sell_amount
                })
                
                if new_qty <= 0:
                    transaction.delete(tgt_stock_doc)
                else:
                    transaction.update(tgt_stock_doc, {
                        'quantity': new_qty
                    })

                # Requester history
                transaction.update(requester_ref, {
                    'taxPoints': req_pts - 100000
                })
                
                transaction.set(hist_req_ref, {
                    'symbol': 'SABOTAGE',
                    'name': '강제 매각 타격',
                    'type': 'TAX',
                    'price': 0,
                    'quantity': 1,
                    'totalAmount': -100000,
                    'fee': 0,
                    'timestamp': firestore.SERVER_TIMESTAMP,
                    'details': f"{target_name}님의 {largest_stock['name']} 타격"
                })

                # Target history
                transaction.set(hist_tgt_ref, {
                    'symbol': largest_stock['symbol'],
                    'name': largest_stock['name'],
                    'type': 'SELL',
                    'price': largest_stock['live_price'],
                    'quantity': sell_qty,
                    'totalAmount': sell_amount,
                    'fee': 0,
                    'profit': profit,
                    'profitRatio': profitRatio,
                    'timestamp': firestore.SERVER_TIMESTAMP,
                    'details': f"{requester_name}에 의한 강제 매각"
                })
                
                return True, {
                    'type': 'FORCED_SALE',
                    'target_name': target_name,
                    'stock_name': largest_stock['name'],
                    'qty': sell_qty,
                    'amount': sell_amount,
                    'target_email': tgt_email,
                    'requester_email': requester_email
                }
            else: # PENNY_STOCK_ATTACK
                # PENNY STOCK ATTACK LOGIC
                # Calculate buy amount: 5% of cash, max 5,000,000
                target_cash = float(tgt_cash)
                buy_limit = 5000000
                buy_budget = min(buy_limit, target_cash * 0.05)
                
                penny_price = selected_penny['price']
                buy_qty = math.floor(buy_budget / penny_price)
                
                if buy_qty < 1:
                    return False, "대상자의 현금이 부족하여 동전주를 매수할 수 없습니다."
                
                actual_cost = buy_qty * penny_price
                
                # Update target cash and portfolio
                if stock_snap_tx.exists:
                    old_data = stock_snap_tx.to_dict()
                    old_qty = float(old_data.get('quantity', 0))
                    old_avg = float(old_data.get('averagePrice', 0))
                    new_qty = old_qty + buy_qty
                    new_avg = ((old_avg * old_qty) + actual_cost) / new_qty
                    
                    transaction.update(tgt_stock_doc, {
                        'quantity': new_qty,
                        'averagePrice': new_avg,
                        'lastUpdated': firestore.SERVER_TIMESTAMP
                    })
                else:
                    transaction.set(tgt_stock_doc, {
                        'symbol': selected_penny['symbol'],
                        'name': selected_penny['name'],
                        'quantity': buy_qty,
                        'averagePrice': penny_price,
                        'lastUpdated': firestore.SERVER_TIMESTAMP
                    })
                    
                transaction.update(target_ref, {
                    'balance': target_cash - actual_cost
                })
                
                # Requester deduction & history
                transaction.update(requester_ref, {
                    'taxPoints': req_pts - 100000
                })
                
                transaction.set(hist_req_ref, {
                    'symbol': 'SABOTAGE',
                    'name': '동전주 매수 공격',
                    'type': 'TAX',
                    'price': 0,
                    'quantity': 1,
                    'totalAmount': -100000,
                    'fee': 0,
                    'timestamp': firestore.SERVER_TIMESTAMP,
                    'details': f"{target_name}님에게 {selected_penny['name']} 강제 매수"
                })
                
                # Target history
                transaction.set(hist_tgt_ref, {
                    'symbol': selected_penny['symbol'],
                    'name': selected_penny['name'],
                    'type': 'BUY',
                    'price': penny_price,
                    'quantity': buy_qty,
                    'totalAmount': actual_cost,
                    'fee': 0,
                    'timestamp': firestore.SERVER_TIMESTAMP,
                    'details': f"{requester_name}에 의한 동전주 강제 매수"
                })
                
                return True, {
                    'type': 'PENNY_STOCK_ATTACK',
                    'target_name': target_name,
                    'stock_name': selected_penny['name'],
                    'qty': buy_qty,
                    'amount': actual_cost,
                    'target_email': tgt_email,
                    'requester_email': requester_email
                }

        transaction = main_firestore.transaction()
        success, result = execute_sabotage(transaction)
    except Exception as e:
        print(f"  !! Sabotage Transaction failed for {uid}: {e}")
        mark_request_failed(uid, "결제 처리 중 오류가 발생했습니다.", 'sabotageRequest')
        return

    if not success:
        mark_request_failed(uid, result, 'sabotageRequest')
        return

    # Success
    print(f"  -> Sabotage executed on {target_uid} by {uid}. Type: {attack_type}")
    main_db.child(f'user_activities/{uid}/sabotageRequest').update({
        'status': 'SUCCESS'
    })

    # Sync both parties to RTDB Cache
    sync_user_to_rtdb(uid)
    sync_user_to_rtdb(target_uid)

    # Broadcast to Ticker
    try:
        if result['type'] == 'FORCED_SALE':
            broadcast_sabotage_ticker(
                requester_name,
                target_name,
                largest_stock['symbol'],
                largest_stock['name'],
                'SABOTAGE_SELL',
                result['amount']
            )
        else: # PENNY_STOCK_ATTACK
            broadcast_sabotage_ticker(
                requester_name,
                target_name,
                selected_penny['symbol'],
                selected_penny['name'],
                'SABOTAGE_BUY',
                result['amount']
            )
    except Exception as ticker_err:
        print(f"  !! Failed to broadcast sabotage ticker: {ticker_err}")

    # 4. Email notification
    if success and result and result.get('target_email'):
        email_manager = EmailManager()
        
        if result['type'] == 'FORCED_SALE':
            subject = f"🛑 [{result['target_name']}님] 보유 주식이 강제 매각되었습니다!"
            body = f"""
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fef2f2; border-radius: 10px; border: 1px solid #fecaca;">
                <h2 style="color: #b91c1c; text-align: center; margin-bottom: 20px;">💣 주의 요망! 강제 매각 발생</h2>
                <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                    <strong>{requester_name}</strong>님이 100,000 포인트를 사용하여 회원님의 포트폴리오를 타격했습니다! <br/>
                    평가 금액이 가장 높았던 우량 자산 일부가 로컬 시장가로 즉시 매각 처리되었습니다.
                </p>
                <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">매각 종목</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #111827;">{result['stock_name']}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">매각 수량</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #111827;">{result['qty']:,} 주</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">강제 입금액</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #059669;">+ {result['amount']:,} 원</td>
                        </tr>
                    </table>
                </div>
                <p style="color: #4b5563; font-size: 13px; text-align: center; margin-top: 20px;">
                    매각 대금은 회원님의 계좌(Cash)로 즉시 입금되었습니다. <br/>
                    포인트 거래소에서 포인트를 모아 복수(?)를 준비해보세요!
                </p>
            </div>
            """
        else: # PENNY_STOCK_ATTACK
            subject = f"🛑 [{result['target_name']}님] 원치 않는 동전주가 강제 매수되었습니다!"
            body = f"""
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fef2f2; border-radius: 10px; border: 1px solid #fecaca;">
                <h2 style="color: #b91c1c; text-align: center; margin-bottom: 20px;">💣 주의 요망! 동전주 강제 매수 발생</h2>
                <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                    <strong>{requester_name}</strong>님이 100,000 포인트를 사용하여 회원님의 포트폴리오를 타격했습니다! <br/>
                    회원님의 현금 자산 일부가 시장에서 가장 저렴한 동전주를 매수하는 데 강제로 사용되었습니다.
                </p>
                <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">매수 종목</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #111827;">{result['stock_name']}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">매수 수량</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #111827;">{result['qty']:,} 주</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">강제 인출액</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #dc2626;">- {result['amount']:,} 원</td>
                        </tr>
                    </table>
                </div>
                <p style="color: #4b5563; font-size: 13px; text-align: center; margin-top: 20px;">
                    해당 종목은 회원님의 포트폴리오에 즉시 추가되었습니다. <br/>
                    포인트 거래소에서 포인트를 모아 복수(?)를 준비해보세요!
                </p>
            </div>
            """
            
        try:
            email_manager.send_email(result['target_email'], subject, body, is_html=True)
        except Exception as e:
            print(f"  !! Failed to send sabotage email to {target_uid}: {e}")

    # 5. Attacker Email Report (New)
    if success and result and result.get('requester_email'):
        email_manager = EmailManager()
        
        if result['type'] == 'FORCED_SALE':
            subject = f"🎯 [작전 성공] {result['target_name']}님 습격 리포트 (강제 매각)"
            body = f"""
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 10px; border: 1px solid #bae6fd;">
                <h2 style="color: #0369a1; text-align: center; margin-bottom: 20px;">🎯 작전 성공: 강제 매각 완료</h2>
                <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                    회원님이 요청하신 <strong>{result['target_name']}</strong>님에 대한 강제 매각 작전이 성공적으로 집행되었습니다. <br/>
                    대상의 우량 자산을 시장가로 처분하여 타격을 입혔습니다.
                </p>
                <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0f2fe;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">타격 종목</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #111827;">{result['stock_name']}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">매각 수량</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #111827;">{result['qty']:,} 주</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">타격 규모 (매각액)</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #e11d48;">{result['amount']:,} 원</td>
                        </tr>
                    </table>
                </div>
                <p style="color: #4b5563; font-size: 13px; text-align: center; margin-top: 20px;">
                    소모된 100,000 포인트는 반환되지 않습니다. <br/>
                    랭킹 페이지에서 대상의 자산 변화를 확인해보세요!
                </p>
            </div>
            """
        else: # PENNY_STOCK_ATTACK
            subject = f"🎯 [작전 성공] {result['target_name']}님 습격 리포트 (동전주 투하)"
            body = f"""
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 10px; border: 1px solid #bae6fd;">
                <h2 style="color: #0369a1; text-align: center; margin-bottom: 20px;">🎯 작전 성공: 동전주 강제 매수 완료</h2>
                <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                    회원님이 요청하신 <strong>{result['target_name']}</strong>님에 대한 동전주 투하 작전이 성공적으로 집행되었습니다. <br/>
                    대상의 현금을 활용해 가치가 낮은 동전주를 강제로 매수하게 하여 포트폴리오를 교란했습니다.
                </p>
                <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0f2fe;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">투하 종목</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #111827;">{result['stock_name']}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">매수 수량</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #111827;">{result['qty']:,} 주</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">소모시킨 현금</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #e11d48;">{result['amount']:,} 원</td>
                        </tr>
                    </table>
                </div>
                <p style="color: #4b5563; font-size: 13px; text-align: center; margin-top: 20px;">
                    소모된 100,000 포인트는 반환되지 않습니다. <br/>
                    대상의 포트폴리오를 지켜보며 다음 작전을 구상해보세요!
                </p>
            </div>
            """
            
        try:
            email_manager.send_email(result['requester_email'], subject, body, is_html=True)
        except Exception as e:
            print(f"  !! Failed to send sabotage report email to {uid}: {e}")

def start_manager():
    print("Season 3 Portfolio Request Manager Started.")
    
    def on_request(event):
        if event.data is None: return
        path_parts = event.path.strip('/').split('/')
        
        if len(path_parts) == 2:
            uid = path_parts[0]
            req_type = path_parts[1]
            req = event.data
            if req and req.get('status') == 'PENDING':
                if req_type == 'portfolioRequest':
                    process_portfolio_request(uid, req)
                elif req_type == 'sabotageRequest':
                    process_sabotage_request(uid, req)
                
        elif len(path_parts) == 1:
            uid = path_parts[0]
            
            req_port = event.data.get('portfolioRequest')
            if req_port and req_port.get('status') == 'PENDING':
                process_portfolio_request(uid, req_port)
                
            req_sab = event.data.get('sabotageRequest')
            if req_sab and req_sab.get('status') == 'PENDING':
                process_sabotage_request(uid, req_sab)
                
        elif len(path_parts) == 0:
            for uid, user_data in event.data.items():
                if isinstance(user_data, dict):
                    req_port = user_data.get('portfolioRequest')
                    if req_port and req_port.get('status') == 'PENDING':
                        process_portfolio_request(uid, req_port)
                    
                    req_sab = user_data.get('sabotageRequest')
                    if req_sab and req_sab.get('status') == 'PENDING':
                        process_sabotage_request(uid, req_sab)

    main_db.child('user_activities').listen(on_request)
    
    while True:
        time.sleep(1)

if __name__ == "__main__":
    start_manager()
