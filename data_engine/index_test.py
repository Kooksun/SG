import requests
import json

def test_naver_indices():
    # Naver polling API for multiple indices
    # Symbols: KOSPI, KOSDAQ, DJI@DJI (Dow), NAS@IXIC (Nasdaq), SPI@SPX (S&P 500)
    symbols = "KOSPI,KOSDAQ,DJI@DJI,NAS@IXIC,SPI@SPX"
    url = f"https://polling.finance.naver.com/api/realtime?query=SERVICE_INDEX:{symbols}"
    
    print(f"Testing Naver Polling API: {url}")
    try:
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        data = response.json()
        
        print("\n--- Naver Polling API Result ---")
        # Structure is result -> areas[0] -> datas
        result = data.get('result', {})
        areas = result.get('areas', [])
        if areas:
            items = areas[0].get('datas', [])
            for item in items:
                name = item.get('nm')
                price = item.get('nv') # Now Value
                change = item.get('cv') # Change Value
                change_rate = item.get('cr') # Change Rate
                print(f"Name: {name}, Price: {price}, Change: {change}, Rate: {change_rate}%")
        else:
            print("No areas found in polling result")
    except Exception as e:
        print(f"Naver Polling API Error: {e}")

def test_naver_individual():
    # Individual mobile API for KR indices
    indices = ['KOSPI', 'KOSDAQ']
    print("\nTesting Naver Mobile API (Individual KR):")
    for code in indices:
        url = f"https://m.stock.naver.com/api/index/{code}/price"
        try:
            response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                snapshot = data[0]
                print(f"{code} snapshot: Price: {snapshot.get('closePrice')}, Change: {snapshot.get('compareToPreviousClosePrice')}")
            else:
                print(f"No price data for {code}")
        except Exception as e:
            print(f"Error fetching {code}: {e}")

def test_naver_api_index_domain():
    # US Indices on Naver API (Index category)
    # Symbols: .DJI, .IXIC, .INX
    symbols = ['.DJI', '.IXIC', '.INX']
    print("\nTesting api.stock.naver.com/index (US Indices):")
    for sym in symbols:
        url = f"https://api.stock.naver.com/index/{sym}/basic"
        try:
            response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
            response.raise_for_status()
            data = response.json()
            print(f"Name: {data.get('stockName')}, Price: {data.get('closePrice')}, Change: {data.get('compareToPreviousClosePrice')}")
        except Exception as e:
            print(f"Error fetching {sym} from api.stock.naver.com/index: {e}")

def test_naver_market_indicators():
    # Candidates for various indicators
    indicators = [
        ('USD/KRW', 'https://api.stock.naver.com/marketindex/exchange/FX_USDKRW/basic'), # Re-testing with header
        ('USD/KRW Alt', 'https://m.stock.naver.com/api/marketindex/exchange/FX_USDKRW'),
        ('WTI Oil', 'https://api.stock.naver.com/marketindex/worldindex/OIL_CL/basic'),
        ('Gold', 'https://api.stock.naver.com/marketindex/worldindex/GOLD/basic'),
        ('US 10Y Bond', 'https://api.stock.naver.com/marketindex/worldindex/IR_US10Y/basic'),
        ('BTC/KRW', 'https://api.stock.naver.com/marketindex/exchange/FX_BTCKRW/basic'),
    ]
    
def test_naver_useful_indicators():
    # Fetch from majors API
    print("\n--- Useful Market Indicators from Naver ---")
    
    # Part 1: Exchange Rates (majors)
    try:
        resp = requests.get('https://api.stock.naver.com/marketindex/majors/part1', headers={'User-Agent': 'Mozilla/5.0'})
        if resp.status_code == 200:
            data = resp.json()
            print("\n[Exchange Rates]")
            for item in data.get('majors', []):
                name = item.get('name')
                price = item.get('closePrice')
                rate = item.get('fluctuationsRatio')
                symbol = item.get('reutersCode')
                if symbol in ['FX_USDKRW', 'FX_JPYKRW', 'FX_EURKRW', 'FX_CNYKRW']:
                    print(f"- {name} ({symbol}): {price} ({rate}%)")
    except Exception as e:
        print(f"Error fetching exchange rates: {e}")

def test_naver_final_indicators():
    print("\n--- Final Useful Market Indicators from Naver ---")
    
    # Selected Indicators with codes found
    selected = {
        'Exchange': [('미국 달러', 'FX_USDKRW'), ('일본 엔(100엔)', 'FX_JPYKRW'), ('유로', 'FX_EURKRW')],
        'Energy': [('WTI유', 'CLcv1'), ('두바이유', 'DCBc1')],
        'Metals': [('국제 금', 'GCcv1')],
        'Bonds': [('미국 국채 10년', 'US10YT=RR'), ('한국 국채 10년', 'KR10YT=RR')],
    }
    
    # Fetch all from majors
    try:
        p1 = requests.get('https://api.stock.naver.com/marketindex/majors/part1', headers={'User-Agent': 'Mozilla/5.0'}).json()
        p2 = requests.get('https://api.stock.naver.com/marketindex/majors/part2', headers={'User-Agent': 'Mozilla/5.0'}).json()
        
        all_items = {}
        for item in p1.get('majors', []): all_items[item.get('reutersCode')] = item
        for cat in p2:
            for item in p2[cat]: all_items[item.get('reutersCode')] = item
            
        for category, items in selected.items():
            print(f"\n[{category}]")
            for name, code in items:
                item = all_items.get(code)
                if item:
                    print(f"- {name}: {item.get('closePrice')} ({item.get('fluctuationsRatio')}%)")
                else:
                    print(f"- {name}: Data not found for {code}")
                    
    except Exception as e:
        print(f"Error fetching indicators: {e}")

    # Extra: VIX (as index)
    try:
        url = "https://api.stock.naver.com/index/.VIX/basic"
        resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        if resp.status_code == 200:
            data = resp.json()
            print(f"\n[Sentiment]\n- VIX(공포지수): {data.get('closePrice')} ({data.get('fluctuationsRatio')}%)")
    except: pass

if __name__ == "__main__":
    test_naver_indices()
    test_naver_final_indicators()
