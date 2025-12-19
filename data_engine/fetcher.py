import FinanceDataReader as fdr
import requests
import yfinance as yf
from bs4 import BeautifulSoup
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Dict, Optional, Iterable
import pandas as pd

from models import Stock
from firestore_client import get_db

db = get_db()
MARKET_TZ = ZoneInfo("Asia/Seoul")

US_TICKER_MAP = {
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
    'BITI': 'BITI (비트코인 인버스)', 'PSQ': 'PSQ (나스닥 1배 인버스)'
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
        currency=currency
    )

def fetch_top_stocks(limit: int = 100, additional_symbols: Iterable[str] = ()) -> Dict[str, Stock]:
    """
    Fetch a snapshot of the top KRX stocks filtered to KOSPI/KOSDAQ.
    Returns a dict keyed by symbol for easy diffing in the scheduler.
    """
    print(f"Fetching latest KRX snapshot (limit={limit})...")
    df = fdr.StockListing('KRX')
    df = df[df['Market'].isin(['KOSPI', 'KOSDAQ', 'KOSDAQ GLOBAL'])]
    
    # Ensure Code is string for reliable matching
    df['Code'] = df['Code'].astype(str)
    
    df_sorted = df.sort_values(by='Marcap', ascending=False)
    
    # Top N
    top_n = df_sorted.head(limit)

    if additional_symbols:
        # Find rows for additional symbols
        # Note: This only finds them if they are still in KOSPI/KOSDAQ list
        print(f"DEBUG: additional_symbols passed: {list(additional_symbols)}")
        additional_mask = df_sorted['Code'].isin(list(additional_symbols))
        additional_df = df_sorted[additional_mask]
        print(f"DEBUG: Found {len(additional_df)} additional stocks in KRX listing.")
        
        # Combine and drop duplicates (in case an additional symbol is also in top N)
        combined = pd.concat([top_n, additional_df]).drop_duplicates(subset=['Code'])
    else:
        combined = top_n

    snapshot: Dict[str, Stock] = {}
    for _, row in combined.iterrows():
        try:
            stock = _build_stock_from_row(row, currency='KRW')
            snapshot[stock.symbol] = stock
        except Exception as e:
            print(f"Error parsing row {row.get('Name')}: {e}")

    print(f"Fetched {len(snapshot)} KR stocks (Rank Top {limit} + Held).")
    return snapshot

def fetch_us_stocks() -> Dict[str, Stock]:
    """
    Fetch a snapshot of selected US stocks.
    """
    # Use global map
    print(f"Fetching latest US snapshot ({len(US_TICKER_MAP)} tickers)...")
    snapshot: Dict[str, Stock] = {}
    
    for ticker, kor_name in US_TICKER_MAP.items():
        try:
            # Always fetch a few days of history to ensure we have data and can calc change
            # Fetching just 'today' often fails with KeyError if market is closed or data not ready
            start_date = (datetime.now() - pd.Timedelta(days=5)).strftime('%Y-%m-%d')
            df = fdr.DataReader(ticker, start=start_date)
            
            if df.empty:
                continue
                
            last_row = df.iloc[-1]
            if len(df) >= 2:
                prev_close = df.iloc[-2]['Close']
                price = float(last_row['Close'])
                change = price - prev_close
                change_percent = (change / prev_close) * 100
            else:
                price = float(last_row['Close'])
                change = 0.0
                change_percent = 0.0

            stock = Stock(
                symbol=ticker,
                name=kor_name, # Use Korean name
                price=price,
                change=change,
                change_percent=change_percent,
                updated_at=datetime.now(MARKET_TZ),
                currency='USD'
            )
            snapshot[stock.symbol] = stock
            
        except Exception as e:
            print(f"Error fetching US stock {ticker}: {e}")

    print(f"Fetched {len(snapshot)} US stocks.")
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
    Fetch data for a single stock (KR or US).
    Identifies if it's a US stock by checking the US ticker map.
    """
    is_us = symbol in US_TICKER_MAP
    name = US_TICKER_MAP.get(symbol, symbol) # default to symbol if not found (will fix later if KR)
    currency = 'USD' if is_us else 'KRW'
    
    try:
        # Fetch data
        start_date = (datetime.now() - pd.Timedelta(days=5)).strftime('%Y-%m-%d')
        df = fdr.DataReader(symbol, start=start_date)
        
        if df.empty:
            return None
            
        last_row = df.iloc[-1]
        
        if not is_us and name == symbol:
             # Try to get KR Name if possible, though fdr.DataReader by symbol doesn't return name directly easily
             # without listing. For retry purpose, we might just keep the name empty or reuse existing?
             # Actually, for KR stocks, we can try to look it up in StockListing if we really wanted to, 
             # but this function is for 'retry', so maybe we can assume the name is already known or just use symbol.
             # Let's try to do a quick lookup if it's KR.
             pass

        if len(df) >= 2:
            prev_close = df.iloc[-2]['Close']
            price = float(last_row['Close'])
            change = price - prev_close
            change_percent = (change / prev_close) * 100
        else:
            price = float(last_row['Close'])
            change = 0.0
            change_percent = 0.0

        return Stock(
            symbol=symbol,
            name=name,
            price=price,
            change=change,
            change_percent=change_percent,
            updated_at=datetime.now(MARKET_TZ),
            currency=currency
        )
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
                'close': float(row['Close'])
            })
            
        return formatted_data
        
    except Exception as e:
        print(f"Error fetching history for {symbol}: {e}")
        return []
