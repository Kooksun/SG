import FinanceDataReader as fdr
import requests
import yfinance as yf
from bs4 import BeautifulSoup
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Dict, Optional, Iterable
import pandas as pd
import time

from models import Stock
from firestore_client import get_db

db = get_db()
MARKET_TZ = ZoneInfo("Asia/Seoul")

US_TICKER_MAP = {
    # 기존 종목
    'AAPL': '애플', 'MSFT': '마이크로소프트', 'GOOGL': '알파벳(구글)', 'AMZN': '아마존', 
    'TSLA': '테슬라', 'NVDA': '엔비디아', 'META': '메타', 'NFLX': '넷플릭스', 
    'AMD': 'AMD', 'INTC': '인텔', 'QQQ': 'QQQ (나스닥100)', 'SPY': 'SPY (S&P500)', 
    'SOXL': 'SOXL (반도체3X)', 'TQQQ': 'TQQQ (나스닥3X)', 'PLTR': '팔란티어', 
    'COIN': '코인베이스', 'HOOD': '로빈후드', 'MSTR': '마이크로스트레티지', 'IONQ': '아이온큐', 
    'RIVN': '리비안', 'AVGO': '브로드컴', 'ORCL': '오라클', 'CRM': '세일즈포스', 
    'ADBE': '어도비', 'CSCO': '시스코', 'PEP': '펩시코', 'KO': '코카콜라', 
    'COST': '코스트코', 'WMT': '월마트', 'DIS': '디즈니', 'NKE': '나이키', 
    'SBUX': '스타벅스', 'MCD': '맥도날드', 'JPM': 'JP모건', 'BAC': '뱅크오브아메리카', 
    'V': '비자', 'MA': '마스터카드', 'PYPL': '페이팔', 
    'UBER': '우버', 'ABNB': '에어비앤비', 'LCID': '루시드', 'U': '유니티', 
    'RBLX': '로블록스', 'OPEN': '오픈도어', 'SOFI': '소파이', 'AFRM': '어펌', 
    'UPST': '업스타트', 'DKNG': '드래프트킹스', 'AI': 'C3 AI',
    'SQQQ': 'SQQQ (나스닥 3배 인버스)', 'SOXS': 'SOXS (반도체 3배 인버스)',
    'BITI': 'BITI (비트코인 인버스)', 'PSQ': 'PSQ (나스닥 1배 인버스)',
    
    # 추가 종목 - 반도체 & AI
    'TSM': 'TSMC', 'ASML': 'ASML', 'MU': '마이크론', 'ARM': 'ARM', 'MRVL': '마벨',
    'QCOM': '퀄컴', 'LRCX': '램리서치', 'KLAC': 'KLA', 'SNPS': '시놉시스', 'CDNS': '케이던스',
    'ADI': '아날로그 디바이스', 'TXN': '테자스 인스트루먼트', 'ON': '온세미', 'MCHP': '마이크로칩',
    'SMCI': '슈퍼마이크로',
    
    # 추가 종목 - 핀테크, 보안, 클라우드
    'SNOW': '스노우플레이크', 'MDB': '몽고DB', 'DDOG': '데이터독', 'NET': '클라우드플레어',
    'PANW': '팔로알토', 'CRWD': '크라우드스트라이크', 'ZS': '지스케일러', 'NOW': '서비스나우',
    'WDAY': '워크데이', 'INTU': '인튜이트', 'TTD': '더 트레이드 데스크', 'SHOP': '쇼피파이',
    'TEAM': '아틀라시안', 'OKTA': '옥타', 'PATH': '유아이패스',
    
    # 추가 종목 - 금융 & 가상자산
    'WFC': '웰스파고', 'GS': '골드만삭스', 'MS': '모건스탠리', 'AXP': '아메리칸 익스프레스',
    'SCHW': '찰스슈왑', 'NU': '누 홀딩스', 'BLK': '블랙록', 'BX': '블랙스톤',
    'MARA': '마라톤 디지털', 'RIOT': '라이엇', 'CLSK': '클린스파크', 'MCO': '무디스',
    
    # 추가 종목 - 헬스케어 & 메디컬
    'LLY': '일라이 릴리', 'NVO': '노보 노디스크', 'UNH': '유나이티드헬스', 'JNJ': '존슨앤존슨',
    'PFE': '화이자', 'MRK': '머크', 'ABBV': '애브비', 'AMGN': '암젠', 'ISRG': '인튜이티브 서지컬',
    'MRNA': '모더나', 'VRTX': '버텍스', 'BIIB': '바이오젠',
    
    # 추가 종목 - 소비재, 유통, 여행
    'LULU': '룰루레몬', 'CMG': '치폴레', 'BKNG': '부킹홀딩스', 'EXPE': '익스피디아',
    'DAL': '델타 항공', 'AAL': '아메리칸 항공', 'CCL': '카니발', 'RCL': '로열 캐리비안',
    'MAR': '메리어트', 'H': '힐튼', 'ELF': 'e.l.f. 뷰티', 'MNST': '몬스터 베버리지',
    'MDLZ': '몬델리즈', 'LOW': '로우스', 'TJX': 'TJX',
    
    # 추가 종목 - 섹터 & 에너지
    'XOM': '엑슨모빌', 'CVX': '쉐브론', 'OXY': '옥시덴탈', 'CAT': '캐터필러', 'DE': '존디어',
    'BA': '보잉', 'GE': 'GE 에어로스페이스', 'RTX': 'RTX', 'LMT': '록히드 마틴', 'F': '포드',
    'GM': '제너럴 모터스', 'UPS': 'UPS',
    
    # 추가 및 강화 ETF (지수, 배당, 원자재)
    'JEPI': 'JEPI (배당성장)', 'SCHD': 'SCHD (미국배당다우존스)', 'VOO': 'VOO (S&P500)',
    'IVV': 'IVV (S&P500)', 'VTI': 'VTI (미국 전체)', 'BND': 'BND (종합채권)',
    'AGG': 'AGG (종합채권)', 'GLD': 'GLD (금)', 'SLV': 'SLV (은)', 'DIA': 'DIA (다우30)',
    'IWM': 'IWM (러셀2000)', 'TLT': 'TLT (20년+ 국채)',
    
    # 레버리지 및 인버스 강화
    'UPRO': 'UPRO (S&P500 3X)', 'TNA': 'TNA (러셀2000 3X)', 'BULZ': 'BULZ (FNG 3X)',
    'TECL': 'TECL (테크 3X)', 'USD': 'USD (반도체 2X)', 'NVDL': 'NVDL (엔비디아 2X)',
    'SPXS': 'SPXS (S&P500 3X 인버스)', 'SDOW': 'SDOW (다우 3X 인버스)',
    'FAZ': 'FAZ (금융 3X 인버스)', 'TZA': 'TZA (러셀2000 3X 인버스)', 'SH': 'SH (S&P500 1X 인버스)',
    'VIXY': 'VIXY (VIX 1X)', 'UVXY': 'UVXY (VIX 1.5X 레버리지)',
    'BITO': 'BITO (비트코인 선물)', 'BITX': 'BITX (비트코인 2X)', 'SBIT': 'SBIT (비트코인 -1X)'
}

def _to_float(value) -> float:
    if isinstance(value, str):
        if value == '-':
            return 0.0
    if pd.isna(value) or value != value: # value != value checks for NaN
        return 0.0
    try:
        val = float(value)
        if val != val: # check NaN again after conversion
            return 0.0
        return val
    except (ValueError, TypeError):
        return 0.0

def _build_stock_from_row(row, currency='KRW') -> Stock:
    """Parse a pandas row into our Stock dataclass."""
    # KRX returns 'Code', US returns index as Date usually, but we will handle US separately or normalize.
    # This function is primarily for the KRX listing format.
    symbol = str(row['Code'])
    name = row['Name']
    raw_market = row.get('Market', 'KOSPI')
    if 'KOSDAQ' in raw_market:
        market = 'KOSDAQ'
    elif 'KOSPI' in raw_market:
        market = 'KRX'  # Google Finance uses KRX for KOSPI
    else:
        market = 'KRX'
    
    # KR stocks are usually integer prices, but let's use float to be safe and consistent
    price = _to_float(row['Close'])
    change = _to_float(row['Changes'])
    change_percent = _to_float(row['ChagesRatio'])

    return Stock(
        symbol=symbol,
        name=name,
        price=price,
        change=change,
        change_percent=change_percent,
        updated_at=datetime.now(MARKET_TZ),
        currency=currency,
        market=market
    )

def fetch_top_stocks(limit: int = 100, additional_symbols: Iterable[str] = ()) -> Dict[str, Stock]:
    """
    Fetch a snapshot of the top KRX stocks (KOSPI/KOSDAQ) via Naver API, excluding ETFs.
    """
    print(f"Fetching latest KRX snapshot (KOSPI Top {limit}, KOSDAQ Top {limit})...")
    snapshot: Dict[str, Stock] = {}
    headers = {"User-Agent": "Mozilla/5.0"}

    # sosok=0 (KOSPI), sosok=1 (KOSDAQ)
    for sosok in [0, 1]:
        market_name = "KRX" if sosok == 0 else "KOSDAQ"
        url = f"https://m.stock.naver.com/api/json/sise/siseListJson.nhn?menu=market_sum&sosok={sosok}&pageSize={limit}&page=1"
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('result', {}).get('itemList', [])
                for item in items:
                    # Skip ETFs as requested
                    if item.get('etf') is True:
                        continue

                    symbol = item.get('cd')
                    price = float(item.get('nv', 0))
                    change = float(item.get('cv', 0))
                    change_rate = float(item.get('cr', 0))
                    
                    snapshot[symbol] = Stock(
                        symbol=symbol,
                        name=item.get('nm'),
                        price=price,
                        change=change,
                        change_percent=change_rate,
                        updated_at=datetime.now(MARKET_TZ),
                        currency='KRW',
                        market=market_name
                    )
        except Exception as e:
            print(f"Error fetching {market_name} listing: {e}")

    # Note: additional_symbols handling moved to scheduler for better consistency
    # with existing RTDB records.
    
    return snapshot

from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch_us_stocks() -> Dict[str, Stock]:
    """
    Fetch a snapshot of selected US stocks via Naver API in parallel.
    """
    print(f"Fetching latest US snapshot ({len(US_TICKER_MAP)} tickers) in parallel...")
    snapshot: Dict[str, Stock] = {}
    headers = {"User-Agent": "Mozilla/5.0"}
    
    def fetch_single(ticker: str, kor_name: str) -> Optional[Stock]:
        # Conservative: sleep 100ms before each ticker request
        time.sleep(0.1)
        try:
            # Optimal order: .O (Nasdaq), .N (NYSE), .A (AMEX), "", .K
            for suffix in ['.O', '.N', '.A', '', '.K']:
                url = f"https://api.stock.naver.com/stock/{ticker}{suffix}/basic"
                resp = requests.get(url, headers=headers, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    # Skip empty or invalid data
                    if not data or 'closePrice' not in data:
                        continue
                        
                    price = float(str(data.get('closePrice', '0')).replace(',', ''))
                    if price <= 0: continue
                    
                    change = float(str(data.get('compareToPreviousClosePrice', '0')).replace(',', ''))
                    ratio = float(data.get('fluctuationsRatio', 0))
                    
                    market = 'NASDAQ' if suffix == '.O' else ('NYSE' if suffix == '.N' else ('AMEX' if suffix == '.A' else 'US'))
                    
                    return Stock(
                        symbol=ticker,
                        name=kor_name,
                        price=price,
                        change=change,
                        change_percent=ratio,
                        updated_at=datetime.now(MARKET_TZ),
                        currency='USD',
                        market=market
                    )
            return None
        except Exception as e:
            # print(f"Error fetching {ticker}: {e}")
            return None

    # Use ThreadPoolExecutor for parallel requests
    # Conservative: 5 workers to be safer
    max_workers = 5
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_ticker = {
            executor.submit(fetch_single, ticker, name): ticker 
            for ticker, name in US_TICKER_MAP.items()
        }
        
        for future in as_completed(future_to_ticker):
            ticker = future_to_ticker[future]
            try:
                stock = future.result()
                if stock:
                    snapshot[ticker] = stock
            except Exception as e:
                print(f"[{ticker}] Generated an exception: {e}")

    print(f"Fetched {len(snapshot)} US stocks (Parallel).")
    return snapshot

def fetch_exchange_rate() -> float:
    try:
        # USD/KRW
        df = fdr.DataReader('USD/KRW', start=(datetime.now() - pd.Timedelta(days=5)).strftime('%Y-%m-%d'))
        if not df.empty:
            return float(df.iloc[-1]['Close'])
    except Exception as e:
        print(f"Error fetching exchange rate: {e}")
    return 1400.0 # Fallback

def fetch_single_stock(symbol: str) -> Optional[Stock]:
    """
    Fetch data for a single stock (KR or US) via Naver API.
    """
    time.sleep(0.1) # Mandatory 100ms throttle

    is_us = any(c.isalpha() for c in symbol) # Simple heuristic for US/KR
    headers = {"User-Agent": "Mozilla/5.0"}
    
    try:
        if not is_us:
            # KR Stock
            url = f"https://m.stock.naver.com/api/stock/{symbol}/basic"
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                price = float(str(data.get('closePrice', '0')).replace(',', ''))
                change = float(str(data.get('compareToPreviousClosePrice', '0')).replace(',', ''))
                ratio = float(data.get('fluctuationsRatio', 0))
                
                market = "KRX"
                # Naver basic API for KR sometimes doesn't show market directly, 
                # but we can infer or use placeholder.
                return Stock(
                    symbol=symbol,
                    name=data.get('stockName', symbol),
                    price=price,
                    change=change,
                    change_percent=ratio,
                    updated_at=datetime.now(MARKET_TZ),
                    currency='KRW',
                    market=market
                )
        else:
            # US Stock - Try suffixes
            for suffix in ['.O', '', '.K', '.N', '.A']:
                url = f"https://api.stock.naver.com/stock/{symbol}{suffix}/basic"
                resp = requests.get(url, headers=headers, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    price = float(str(data.get('closePrice', '0')).replace(',', ''))
                    change = float(str(data.get('compareToPreviousClosePrice', '0')).replace(',', ''))
                    ratio = float(data.get('fluctuationsRatio', 0))
                    
                    return Stock(
                        symbol=symbol,
                        name=US_TICKER_MAP.get(symbol, symbol),
                        price=price,
                        change=change,
                        change_percent=ratio,
                        updated_at=datetime.now(MARKET_TZ),
                        currency='USD',
                        market='NASDAQ' if suffix == '.O' else ('NYSE' if suffix == '.N' else 'AMEX')
                    )
                time.sleep(0.1)
                
    except Exception as e:
        print(f"Error fetching single stock {symbol}: {e}")
    return None

def commit_stock_changes(stocks_to_upsert: Iterable[Stock], symbols_to_delete: Iterable[str] = ()):
    """
    Write the provided stocks to Firestore and delete any stale symbols.
    Only changed stocks should be passed in to minimize writes.
    """
    upserts = list(stocks_to_upsert)
    deletions = list(symbols_to_delete)

    if not upserts and not deletions:
        print("No Firestore changes to commit.")
        return

    batch = db.batch()
    operation_count = 0

    def flush_batch():
        nonlocal batch, operation_count
        if operation_count == 0:
            return
        batch.commit()
        batch = db.batch()
        operation_count = 0

    for stock in upserts:
        # Stamp the write time right before persisting.
        stock.updated_at = datetime.now(MARKET_TZ)
        doc_ref = db.collection('stocks').document(stock.symbol)
        batch.set(doc_ref, stock.to_dict())
        operation_count += 1
        if operation_count >= 450:
            flush_batch()

    for symbol in deletions:
        doc_ref = db.collection('stocks').document(symbol)
        batch.delete(doc_ref)
        operation_count += 1
        if operation_count >= 450:
            flush_batch()

    flush_batch()
    print(f"Committed {len(upserts)} stock updates and {len(deletions)} deletions.")

def update_stocks(limit: int = 100):
    """
    Backwards-compatible helper to fetch and write the full snapshot.
    This still exists for manual runs, but the scheduler now handles
    incremental updates on top of this helper.
    """
    snapshot = fetch_top_stocks(limit=limit)
    commit_stock_changes(snapshot.values())

if __name__ == "__main__":
    update_stocks()

def fetch_indices() -> Dict[str, Dict]:
    """
    Fetch major market indices: KOSPI, KOSDAQ, S&P 500, Nasdaq, Dow Jones.
    """
    indices = {
        'KOSPI': 'KS11',
        'KOSDAQ': 'KQ11',
        'S&P 500': 'US500',
        'Nasdaq': 'IXIC',
        'Dow Jones': 'DJI'
    }
    
    results = {}
    print(f"Fetching latest market indices...")
    for name, sym in indices.items():
        try:
            # Fetch last few days to ensure we have data to calculate change
            df = fdr.DataReader(sym, start=(datetime.now() - pd.Timedelta(days=5)).strftime('%Y-%m-%d'))
            if df.empty:
                continue
                
            last_row = df.iloc[-1]
            if len(df) >= 2:
                prev_close = float(df.iloc[-2]['Close'])
                price = float(last_row['Close'])
                change = float(price - prev_close)
                change_percent = float((change / prev_close) * 100)
            else:
                price = float(last_row['Close'])
                change = 0.0
                change_percent = 0.0

            results[name] = {
                'symbol': sym,
                'name': name,
                'price': price,
                'change': change,
                'change_percent': change_percent,
                'updated_at': datetime.now(MARKET_TZ).isoformat()
            }
        except Exception as e:
            print(f"Error fetching index {name} ({sym}): {e}")
            
    return results

def fetch_stock_history(symbol: str, days: int = 90) -> List[Dict]:
    """
    Fetches historical daily data using yfinance.
    Returns a list of dicts suitable for Lightweight Charts:
    [{ 'time': '2023-01-01', 'open': 100, 'high': 110, 'low': 90, 'close': 105 }, ...]
    """
    yf_symbol = symbol
    
    # Identify if it should be treated as KR
    # If it is NOT in our US map, we treat it as KR (KOSPI first)
    is_known_us = symbol in US_TICKER_MAP
    
    if not is_known_us:
        yf_symbol = f"{symbol}.KS"
    
    print(f"Fetching history for {yf_symbol}...")
    try:
        ticker = yf.Ticker(yf_symbol)
        # Fetch slightly more than needed to ensure we have enough trading days
        hist = ticker.history(period="1y", interval="1d")
        
        if hist.empty and not is_known_us:
             # Fallback to KQ if KS failed (only for implicit KR stocks)
             yf_symbol = f"{symbol}.KQ"
             print(f"Retrying with {yf_symbol}...")
             ticker = yf.Ticker(yf_symbol)
             hist = ticker.history(period="1y", interval="1d")
        
        if hist.empty:
            print(f"No history found for {symbol}")
            return []
            
        # Format for lightweight-charts
        formatted_data = []
        for date, row in hist.iterrows():
            # Check for NaNs
            if pd.isna(row['Open']) or pd.isna(row['High']) or pd.isna(row['Low']) or pd.isna(row['Close']):
                continue
                
            # date is Timestamp, convert to 'YYYY-MM-DD' string
            formatted_data.append({
                'time': date.strftime('%Y-%m-%d'),
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close']),
                'volume': float(row['Volume'])
            })
            
        return formatted_data
        
    except Exception as e:
        print(f"Error fetching history for {symbol}: {e}")
        return []
