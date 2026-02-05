import requests
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Dict, Optional
from .models import Stock

MARKET_TZ = ZoneInfo("Asia/Seoul")

def fetch_kr_stocks(kospi_limit: int = 500, kosdaq_limit: int = 700) -> Dict[str, Stock]:
    """Fetch top KOSPI and KOSDAQ stocks from Naver with large pageSize."""
    snapshot: Dict[str, Stock] = {}
    headers = {"User-Agent": "Mozilla/5.0"}

    # sosok=0 (KOSPI), sosok=1 (KOSDAQ)
    configs = [
        (0, kospi_limit, "KOSPI"),
        (1, kosdaq_limit, "KOSDAQ")
    ]

    for sosok, limit, market_name in configs:
        url = f"https://m.stock.naver.com/api/json/sise/siseListJson.nhn?menu=market_sum&sosok={sosok}&pageSize={limit}&page=1"
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('result', {}).get('itemList', [])
                for item in items:
                    # Skip ETFs here as they might appear in KOSPI/KOSDAQ lists
                    if item.get('etf') is True:
                        continue
                    
                    symbol = item.get('cd')
                    snapshot[symbol] = Stock(
                        symbol=symbol,
                        name=item.get('nm'),
                        price=float(item.get('nv', 0)),
                        change=float(item.get('cv', 0)),
                        change_percent=float(item.get('cr', 0)),
                        volume=float(item.get('aq', 0)),
                        updated_at=datetime.now(MARKET_TZ),
                        currency='KRW',
                        market=market_name
                    )
        except Exception as e:
            print(f"Error fetching {market_name} listing: {e}")
    
    return snapshot

def fetch_etf_stocks(limit: int = 200) -> Dict[str, Stock]:
    """Fetch top ETF stocks using specialized Naver Finance API."""
    snapshot: Dict[str, Stock] = {}
    headers = {"User-Agent": "Mozilla/5.0"}
    
    # This endpoint returns a larger list of ETFs
    url = "https://finance.naver.com/api/sise/etfItemList.nhn"
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('result', {}).get('etfItemList', [])
            # Sort by market value or just take top N (it's usually pre-sorted by something)
            # For now, let's take up to limit
            for item in items[:limit]:
                symbol = item.get('itemcode')
                snapshot[symbol] = Stock(
                    symbol=symbol,
                    name=item.get('itemname'),
                    price=float(item.get('nowVal', 0)),
                    change=float(item.get('changeVal', 0)),
                    change_percent=float(item.get('changeRate', 0)),
                    volume=float(item.get('accTrdVol', 0)),
                    updated_at=datetime.now(MARKET_TZ),
                    currency='KRW',
                    market='ETF'
                )
    except Exception as e:
        print(f"Error fetching ETF listing: {e}")
    
    return snapshot

def fetch_exchange_rate() -> float:
    """Fetch USD/KRW exchange rate from Naver."""
    try:
        url = "https://api.stock.naver.com/marketindex/majors/part1"
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            for item in data.get('majors', []):
                if item.get('reutersCode') == 'FX_USDKRW':
                    return float(str(item.get('closePrice', '1400.0')).replace(',', ''))
    except: pass
    return 1400.0

def fetch_indices() -> Dict[str, Dict]:
    """Fetch major market indices."""
    results = {}
    headers = {"User-Agent": "Mozilla/5.0"}
    index_map = {
        'KOSPI': 'https://m.stock.naver.com/api/index/KOSPI/price',
        'KOSDAQ': 'https://m.stock.naver.com/api/index/KOSDAQ/price',
        'S&P 500': 'https://api.stock.naver.com/index/.INX/basic',
        'Nasdaq': 'https://api.stock.naver.com/index/.IXIC/basic'
    }
    for name, url in index_map.items():
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                if 'price' in url:
                    if isinstance(data, list) and data:
                        d = data[0]
                        price = float(str(d.get('closePrice', '0')).replace(',', ''))
                        change = float(str(d.get('compareToPreviousClosePrice', '0')).replace(',', ''))
                        ratio = float(d.get('fluctuationsRatio', 0))
                    else: continue
                else:
                    price = float(str(data.get('closePrice', '0')).replace(',', ''))
                    change = float(str(data.get('compareToPreviousClosePrice', '0')).replace(',', ''))
                    ratio = float(data.get('fluctuationsRatio', 0))
                
                results[name] = {
                    'symbol': name,
                    'name': name,
                    'price': price,
                    'change': change,
                    'change_percent': ratio,
                    'updated_at': datetime.now(MARKET_TZ).isoformat()
                }
        except: pass
    return results

def fetch_stock_chart(symbol: str, page_size: int = 60, page: int = 1) -> List[List]:
    """
    Fetch historical stock data from Naver and compress it into an array format.
    Format: [Date(YYYY-MM-DD), Open, High, Low, Close, Volume]
    """
    headers = {"User-Agent": "Mozilla/5.0"}
    url = f"https://m.stock.naver.com/api/stock/{symbol}/price?pageSize={page_size}&page={page}"
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if not isinstance(data, list):
                return []
            
            compressed = []
            for item in data:
                # Naver fields: localTradedAt, openPrice, highPrice, lowPrice, closePrice, accumulatedTradingVolume
                # Dates are like "2024-02-05 00:00:00"
                date_str = item.get('localTradedAt', '')[:10] 
                
                def p(val):
                    if isinstance(val, str):
                        return float(val.replace(',', ''))
                    return float(val or 0)

                compressed.append([
                    date_str,
                    p(item.get('openPrice')),
                    p(item.get('highPrice')),
                    p(item.get('lowPrice')),
                    p(item.get('closePrice')),
                    p(item.get('accumulatedTradingVolume'))
                ])
            return compressed
    except Exception as e:
        print(f"Error fetching chart for {symbol}: {e}")
    return []
