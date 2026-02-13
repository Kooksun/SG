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
        "description": "저평가된 우량주를 찾아 장기 투자하는 스타일입니다. 재무 제표와 펀더멘털을 중시하며, 변동성에 일희일비하지 않습니다.",
        "prompt_vibe": "신중하고 논리적이며, 안전 마진을 중시하는 현인 스타일"
    },
    "speculator": {
        "name": "불나방 (AI)",
        "description": "급등주, 테마주 위주의 초단기 매매를 선호합니다. 리스크가 크더라도 높은 수익률을 쫓으며, 거래량이 터지는 종목에 민감하게 반응합니다.",
        "prompt_vibe": "흥분하기 쉽고, 차트와 거래량에 집착하며, '가즈아'를 외치는 공격적 단타꾼 스타일"
    },
    "conservative": {
        "name": "안전지구 (AI)",
        "description": "지수 추종 ETF나 시총 상위 대형주 위주로 안정적인 수익을 추구합니다. 원금 손실을 극도로 꺼리며 보수적으로 자산을 운용합니다.",
        "prompt_vibe": "매우 조심스럽고, 숫자에 밝으며, 자산 배분을 최우선으로 하는 원칙주의자 스타일"
    }
}

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
        """Gather top moving stocks and general market info."""
        # Fetch all stocks from RTDB and sort in Python to avoid indexing errors
        try:
            kospi_stocks = kospi_db.child('stocks/KOSPI').get() or {}
            kosdaq_stocks = kosdaq_db.child('stocks/KOSDAQ').get() or {}
        except Exception as e:
            print(f"Error fetching stocks: {e}")
            kospi_stocks = {}
            kosdaq_stocks = {}
        
        def get_top_gainers(stocks_dict, limit=10):
            if not stocks_dict: return "No data available."
            s_list = list(stocks_dict.values())
            # Filter out invalid prices/changes
            s_list = [s for s in s_list if s.get('price', 0) > 0]
            s_list.sort(key=lambda x: x.get('change_percent', 0), reverse=True)
            
            lines = []
            for s in s_list[:limit]:
                lines.append(f"- {s.get('name')} ({s.get('symbol')}): {s.get('price'):,.0f}원 ({s.get('change_percent'):+.2f}%, 거래량: {s.get('volume'):,.0f})")
            return "\n".join(lines)

        context = f"[KOSPI 상승 상위 종목]\n"
        context += get_top_gainers(kospi_stocks) + "\n\n"
        context += f"[KOSDAQ 상승 상위 종목]\n"
        context += get_top_gainers(kosdaq_stocks) + "\n"
        
        return context

    def get_bot_portfolio_context(self) -> str:
        """Fetch current balance and holdings."""
        # Reload bot data to get latest balance
        self.bot_data = self._load_bot_data()
        balance = self.bot_data.get('balance', 0)
        
        portfolio_ref = main_firestore.collection('users').document(self.bot_uid).collection('portfolio')
        holdings = portfolio_ref.stream()
        
        lines = [f"[나의 자산 상태]\n- 현금 잔고: {balance:,.0f} KRW"]
        holding_list = []
        for h in holdings:
            d = h.to_dict()
            symbol = d.get('symbol')
            qty = d.get('quantity', 0)
            avg = d.get('averagePrice', 0)
            
            # Use current price from trade_engine logic
            price, _, _ = get_latest_price(symbol)
            if price <= 0: price = avg # Fallback
            
            holding_list.append(f"- {d.get('name')} ({symbol}): {qty}주 (평단가: {avg:,.0f}원, 현재가: {price:,.0f}원)")
        
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
        
        prompt = f"""
당신은 주식 투자 게임의 AI 참가자 '{self.persona['name']}'입니다.
당신의 투자 스타일: {self.persona['description']}
말투와 분위기: {self.persona['prompt_vibe']}

{market_ctx}

{portfolio_ctx}

위 정보를 바탕으로 현재 시장 상황에서 어떤 행동을 할지 결정하세요.
행동은 'BUY', 'SELL', 'HOLD' 중 하나여야 합니다. 

반드시 아래 JSON 형식으로만 답변하세요 (다른 설명 없이 JSON만 출력):
{{
    "analysis": "현재 시장 상황과 나의 포트폴리오에 대한 분석 내용 (페르소나에 맞춰 작성)",
    "decision": "BUY" | "SELL" | "HOLD",
    "symbol": "종목코드 (6자리)",
    "quantity": 수량 (숫자),
    "reason": "결정 이유"
}}

주의: 
- 매수 시 현금 잔고를 초과할 수 없습니다. (거래 금액 = 현재가 * 수량)
- 매도 시 보유 수량을 초과할 수 없습니다.
- 아무것도 하고 싶지 않거나 적절한 종목이 없다면 'HOLD'를 선택하세요.
- 종목 코드는 반드시 6자리 문자열이어야 합니다 (예: 005930, 0013V0).
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
            
            decision_data = json.loads(cleaned_json)
            print(f"  -> Decision: {decision_data.get('decision')} | {decision_data.get('reason')}")
            
            if decision_data.get('decision') in ['BUY', 'SELL']:
                self._submit_order(decision_data)
            else:
                print(f"  -> {self.persona['name']} decided to HOLD.")
                
        except Exception as e:
            print(f"Error parsing LLM decision: {e}")
            print(f"Raw response: {response_text}")

    def _call_llm(self, prompt: str) -> str:
        # Use Groq (llama-3-70b) as primary for speed and intelligence, fallback to Gemini
        if groq_client:
            try:
                model_name = "llama-3.3-70b-versatile"
                print(f"  -> Calling Groq ({model_name})...")
                completion = groq_client.chat.completions.create(
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=600,
                    temperature=0.8
                )
                return completion.choices[0].message.content
            except Exception as e:
                print(f"  -> Groq failed: {e}. Falling back to Gemini.")

        if GEMINI_API_KEY:
            try:
                model_name = "gemini-1.5-pro"
                print(f"  -> Calling Gemini ({model_name})...")
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(prompt)
                return response.text
            except Exception as e:
                print(f"  -> Gemini failed: {e}")
        
        return '{"decision": "HOLD", "reason": "AI Service unavailable"}'

    def _submit_order(self, decision_data: Dict[str, Any]):
        symbol = str(decision_data.get('symbol', '')).strip().upper()
        # Ensure 6 chars for KR styles if it looks like a KR symbol
        if len(symbol) < 6 and any(c.isdigit() for c in symbol):
            symbol = symbol.zfill(6)
        
        quantity = int(decision_data.get('quantity', 0))
        tx_type = decision_data.get('decision')
        
        if not symbol or quantity <= 0:
            print(f"  !! Invalid order data: {symbol} x {quantity}")
            return

        # Double check price
        price, market, _ = get_latest_price(symbol)
        if price <= 0:
            print(f"  !! Stock {symbol} not found or price is 0.")
            return

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
            balance = self.bot_data.get('balance', 0)
            total_cost = price * quantity
            if balance < total_cost:
                print(f"  !! Insufficient balance for BUY: {balance:,} < {total_cost:,}")
                return

        # Submit to RTDB
        main_db.child(f'orders/{self.bot_uid}/{order_id}').set(order_payload)
        print(f"  [ORDER SUBMITTED] {tx_type} {name} ({symbol}) x {quantity} @ {price:,.0f} KRW")

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
