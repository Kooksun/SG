import os
import time
import random
import json
from datetime import datetime
from typing import List, Dict, Any

import google.generativeai as genai
from groq import Groq

from .firebase_config import main_db, main_firestore, kospi_db, kosdaq_db
from .fetcher import fetch_kr_stocks, fetch_etf_stocks, MARKET_TZ
from .trade_engine import get_latest_price

try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None

# Configure LLMs
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client = None
if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)

PERSONAS = {
    "value_investor": {
        "name": "워런 버핏 (AI)",
        "description": "저평가된 우량주를 찾아 장기 투자합니다. '기타 시장 종목 샘플'에서 PER/PBR이 낮거나 재무가 탄탄한 기업을 발굴하는 데 집중하세요. 급등주나 상한가 종목은 투기적이므로 피하십시오.",
        "prompt_vibe": "현명하고 보수적이며, 숫자의 이면을 보는 통찰력 있는 투자 대가 스타일"
    },
    "speculator": {
        "name": "불나방 (AI)",
        "description": "급등주와 테마주에 올인합니다. '상승 상위' 및 '거래량 상위' 종목 중 상한가(+30%)에 도달했거나 근접한 종목을 가장 선호합니다. '가즈아' 정신으로 강력한 모멘텀에 올라타세요.",
        "prompt_vibe": "공격적이고 흥분도가 높으며, 단기 차익 실현을 위해 수단과 방법을 가리지 않는 단타꾼 스타일"
    },
    "conservative": {
        "name": "안전지구 (AI)",
        "description": "안정성을 최우선으로 합니다. 반드시 '시가총액 상위 대형주' 또는 'ETF' 종목만 거래하세요. 변동성이 큰 개별 주식은 철저히 배제하고 지수와 동행하는 안정적 수익을 추구합니다.",
        "prompt_vibe": "극도로 조심스럽고 원칙을 사수하며, 변동성을 혐오하는 자산 관리 전문가 스타일"
    }
}

def search_news(query: str, max_results: int = 5) -> str:
    """Search for latest news using DuckDuckGo."""
    if not DDGS:
        return "Search functionality unavailable."
    
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, region='kr-kr', safesearch='off', timelimit='d', max_results=max_results))
            if not results:
                return "No recent news found."
            
            lines = []
            for r in results:
                lines.append(f"- {r.get('title')}: {r.get('body')[:150]}...")
            return "\n".join(lines)
    except Exception as e:
        return f"Search error: {e}"

class AIBotManager:
    def __init__(self, bot_uid: str):
        self.bot_uid = bot_uid
        self.bot_data = self._load_bot_data()
        self.persona = PERSONAS.get(self.bot_data.get('persona', 'conservative'))

    def _load_bot_data(self) -> Dict[str, Any]:
        doc = main_firestore.collection('users').document(self.bot_uid).get()
        if not doc.exists:
            raise ValueError(f"Bot with UID {self.bot_uid} not found.")
        return doc.to_dict()

    def get_market_context(self) -> str:
        """Gather diverse market data: Top Gainers, Top Volume, and a Sample of other stocks."""
        try:
            kospi_stocks = kospi_db.child('stocks/KOSPI').get() or {}
            kosdaq_stocks = kosdaq_db.child('stocks/KOSDAQ').get() or {}
        except Exception as e:
            print(f"Error fetching stocks: {e}")
            kospi_stocks = {}
            kosdaq_stocks = {}
        
        all_stocks = list(kospi_stocks.values()) + list(kosdaq_stocks.values())
        all_stocks = [s for s in all_stocks if s.get('price', 0) > 0]

        # 1. Top Gainers (Speculator target)
        gainers = sorted(all_stocks, key=lambda x: x.get('change_percent', 0), reverse=True)[:10]
        # 2. Top Volume (Speculator/Conservative target)
        volume_leaders = sorted(all_stocks, key=lambda x: x.get('volume', 0), reverse=True)[:10]
        # 3. Random Sample (for Buffett to find hidden value)
        if len(all_stocks) > 20:
            sample = random.sample(all_stocks, 15)
        else:
            sample = all_stocks

        def format_list(title, stocks):
            lines = [f"[{title}]"]
            for s in stocks:
                price = s.get('price') or 0
                change = s.get('change_percent') or 0
                volume = s.get('volume') or 0
                lines.append(f"- {s.get('name')} ({s.get('symbol')}): {price:,.0f}원 ({change:+.2f}%, 거래량: {volume:,.0f})")
            return "\n".join(lines)

        context = format_list("상승 상위 종목", gainers) + "\n\n"
        context += format_list("거래량 상위 종목", volume_leaders) + "\n\n"
        context += format_list("기타 시장 종목 샘플", sample)
        
        # Add Web Search Context for Market Pulse
        print(f"  -> Fetching global market news...")
        market_news = search_news("오늘의 한국 증시 시황 테마 뉴스", max_results=5)
        context = f"[오늘의 증시 시황 및 뉴스]\n{market_news}\n\n" + context
        
        return context

    def get_bot_portfolio_context(self) -> str:
        """Fetch current balance and holdings."""
        # Reload bot data to get latest balance
        self.bot_data = self._load_bot_data()
        balance = self.bot_data.get('balance') or 0
        
        portfolio_ref = main_firestore.collection('users').document(self.bot_uid).collection('portfolio')
        holdings = portfolio_ref.stream()
        
        lines = [f"[나의 자산 상태]\n- 현금 잔고: {balance:,.0f} KRW"]
        holding_list = []
        self.current_holdings = {}
        for h in holdings:
            d = h.to_dict()
            symbol = d.get('symbol')
            qty = d.get('quantity') or 0
            avg = d.get('averagePrice') or 0
            
            # Use current price from trade_engine logic
            price, _, _ = get_latest_price(symbol)
            if not price or price <= 0: price = avg # Fallback
            
            holding_list.append(f"- {d.get('name')} ({symbol}): {qty}주 (평단가: {avg:,.0f}원, 현재가: {price:,.0f}원)")
            self.current_holdings[symbol] = qty
        
        if holding_list:
            lines.append("\n[현재 보유 주식]")
            lines.extend(holding_list)
        else:
            lines.append("\n[현재 보유 주식 없음]")
            
        return "\n".join(lines)

    def decide_and_act(self):
        print(f"[{datetime.now(MARKET_TZ)}] Bot {self.persona['name']} ({self.bot_uid}) is thinking...")
        
        market_ctx = self.get_market_context()
        portfolio_ctx = self.get_bot_portfolio_context()
        
        # Add specific search for top holdings if any
        holdings_news = ""
        top_symbols = list(self.current_holdings.keys())[:2] # Search for top 2 holdings to avoid too many queries
        for sym in top_symbols:
             # Get name for the symbol
             name = "Unknown"
             for m in ['KOSPI', 'KOSDAQ', 'ETF']:
                target_db = kospi_db if m in ['KOSPI', 'ETF'] else kosdaq_db
                s_data = target_db.child(f'stocks/{m}/{sym}').get()
                if s_data:
                    name = s_data.get('name', 'Unknown')
                    break
             print(f"  -> Fetching news for {name} ({sym})...")
             news = search_news(f"주식 {name} {sym} 최신 호재 악재 뉴스", max_results=3)
             holdings_news += f"\n[{name} ({sym}) 관련 뉴스]\n{news}\n"
        
        if holdings_news:
            portfolio_ctx += "\n" + holdings_news

        prompt = f"""
당신은 주식 투자 게임의 AI 참가자 '{self.persona['name']}'입니다.
당신의 투자 전략 지침: {self.persona['description']}
말투와 분위기: {self.persona['prompt_vibe']}

{market_ctx}

{portfolio_ctx}

위 정보를 바탕으로 어떤 행동을 할지 결정하세요. 우선순위에 따라 최대 3개의 후보를 선택하세요.
최근 뉴스 정보가 있다면 이를 적극적으로 참고하여 시장의 분위기와 테마를 매매에 반영하세요.

반드시 아래 JSON 형식으로만 답변하세요 (주석이나 다른 설명 없이 순수 JSON만 출력):
{{
    "analysis": "현재 상황 및 뉴스 분석(반드시 언급된 뉴스와 연계하여 설명), 투자 지침 이행 근거",
    "decisions": [
        {{
            "rank": 1,
            "decision": "BUY" | "SELL" | "HOLD",
            "symbol": "종목코드 (6자리)",
            "percentage": 사용하고자 하는 비율 (숫자, 1~100),
            "reason": "결정 이유 (뉴스/테마 기반 근거 포함)"
        }}
    ]
}}

중요 규칙:
1. **비율(percentage) 기반**: 
   - BUY: 가용 현금(현금 잔고)의 몇 %를 이 종목 매수에 투입할지 (정수 1-100)
   - SELL: 보유 중인 해당 종목 수량의 몇 %를 매도할지 (정수 1-100)
2. **페르소나 준수**: 각자의 투자 지침(버핏: 가치주 발굴, 불나방: 상한가/급등주 올인, 안전지구: 대형주 전용)을 엄격히 따르세요.
3. **상한가 허용**: 현재 상한가(+30%)에 도달한 종목이더라도 불나방은 원한다면 매수할 수 있습니다. 시스템이 허용합니다.
4. **JSON 무결성**: 절대로 JSON 안에 주석(// 또는 #)을 포함하지 마세요.
5. **현실감 반영**: 제공된 '오늘의 증시 시황'과 '종목 뉴스'를 분석에 반드시 포함시켜 왜 지금 이 종목을 사거나 파는지 논리적으로 설명하세요.
"""
        
        # LLM Call
        response_text = self._call_llm(prompt)
        try:
            # Clean response text
            cleaned_json = response_text.strip()
            if "```json" in cleaned_json:
                cleaned_json = cleaned_json.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned_json:
                cleaned_json = cleaned_json.split("```")[1].strip()
            
            # Simple comment stripping (regex)
            import re
            cleaned_json = re.sub(r'#.*$', '', cleaned_json, flags=re.MULTILINE) 
            cleaned_json = re.sub(r'//.*$', '', cleaned_json, flags=re.MULTILINE) 
            
            decision_data = json.loads(cleaned_json)
            decisions = decision_data.get('decisions', [])
            
            if not decisions and 'decision' in decision_data:
                decisions = [decision_data]

            print(f"  -> {self.persona['name']} analysis: {decision_data.get('analysis', 'No analysis provided.')}")
            
            action_taken = False
            for d in decisions:
                tx_type = d.get('decision')
                symbol = str(d.get('symbol', '')).strip().upper()
                pct = float(d.get('percentage', 0))
                reason = d.get('reason')
                
                if tx_type == 'HOLD':
                    print(f"  -> Rank {d.get('rank', 1)}: Decided to HOLD.")
                    action_taken = True
                    break
                
                if tx_type in ['BUY', 'SELL']:
                    # Calculate quantity based on percentage
                    price, _, _ = get_latest_price(symbol)
                    if price <= 0:
                        print(f"  -> Rank {d.get('rank', 1)}: Skipping {symbol} (Price not found).")
                        continue

                    qty = 0
                    if tx_type == 'BUY':
                        avail_cash = self.bot_data.get('balance', 0)
                        target_budget = avail_cash * (pct / 100.0)
                        # Reserve a bit for fees (though bot fees might be 0, good practice)
                        qty = int(target_budget // price)
                    else: # SELL
                        current_qty = self.current_holdings.get(symbol, 0)
                        qty = int(current_qty * (pct / 100.0))

                    if qty <= 0:
                        print(f"  -> Rank {d.get('rank', 1)}: Skipping {tx_type} {symbol} (Quantity is 0).")
                        continue

                    print(f"  -> Rank {d.get('rank', 1)}: {tx_type} {symbol} ({pct}%) -> {qty}주 | {reason}")
                    d['quantity'] = qty # Update decision data with calculated quantity
                    if self._submit_order(d):
                        action_taken = True
                        break
            
            if not action_taken:
                print(f"  -> {self.persona['name']} could not find a valid executable action from choices.")
                
        except Exception as e:
            print(f"Error parsing LLM decision: {e}")
            print(f"Raw response: {response_text}")

    def _call_llm(self, prompt: str) -> str:
        # Use Groq as primary for speed and intelligence, fallback to Gemini
        if groq_client:
            try:
                model_name = "openai/gpt-oss-120b"
                print(f"  -> Calling Groq ({model_name})...")
                completion = groq_client.chat.completions.create(
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    #max_tokens=1000,
                    temperature=0.8
                )
                return completion.choices[0].message.content
            except Exception as e:
                print(f"  -> Groq failed: {e}. Falling back to Gemini.")

        if GEMINI_API_KEY:
            try:
                model_name = "gemini-3-flash-preview"
                print(f"  -> Calling Gemini ({model_name})...")
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(prompt)
                return response.text
            except Exception as e:
                print(f"  -> Gemini failed: {e}")
        
        return '{"decision": "HOLD", "reason": "AI Service unavailable"}'

    def _submit_order(self, decision_data: Dict[str, Any]) -> bool:
        symbol = str(decision_data.get('symbol', '')).strip().upper()
        # Ensure 6 chars for KR styles if it looks like a KR symbol
        if len(symbol) < 6 and any(c.isdigit() for c in symbol):
            symbol = symbol.zfill(6)
        
        quantity = int(decision_data.get('quantity', 0))
        tx_type = decision_data.get('decision')
        
        if not symbol or quantity <= 0:
            print(f"  !! Invalid order data: {symbol} x {quantity}")
            return False

        # Double check price
        price, market, _ = get_latest_price(symbol)
        if price <= 0:
            print(f"  !! Stock {symbol} not found or price is 0.")
            return False

        # Get official Name
        name = "Unknown"
        # Check in RTDB for name
        for m in ['KOSPI', 'KOSDAQ', 'ETF']:
            target_db = kospi_db if m in ['KOSPI', 'ETF'] else kosdaq_db
            s_data = target_db.child(f'stocks/{m}/{symbol}').get()
            if s_data:
                name = s_data.get('name', 'Unknown')
                break

        order_id = f"bot_{int(time.time() * 1000)}"
        order_payload = {
            "symbol": symbol,
            "name": name,
            "type": tx_type,
            "orderType": "MARKET",
            "quantity": quantity,
            "price": price,
            "status": "PENDING",
            "timestamp": datetime.now(MARKET_TZ).isoformat(),
            "isBot": True
        }
        
        # Check balance for BUY
        if tx_type == 'BUY':
            balance = self.bot_data.get('balance') or 0
            total_cost = price * quantity
            if balance < total_cost:
                print(f"  !! Insufficient balance for BUY: {balance:,.0f} < {total_cost:,.0f}")
                return False

        # Submit to RTDB
        try:
            main_db.child(f'orders/{self.bot_uid}/{order_id}').set(order_payload)
            print(f"  [ORDER SUBMITTED] {tx_type} {name} ({symbol}) x {quantity} @ {price:,.0f} KRW")
            return True
        except Exception as e:
            print(f"  [ORDER FAILED] {e}")
            return False

def run_all_bots():
    bot_uids = ["bot_buffett", "bot_bulnabang", "bot_safety"]
    for uid in bot_uids:
        try:
            manager = AIBotManager(uid)
            manager.decide_and_act()
            # Random delay
            time.sleep(random.uniform(2, 5))
        except Exception as e:
            print(f"Error running bot {uid}: {e}")

if __name__ == "__main__":
    run_all_bots()
