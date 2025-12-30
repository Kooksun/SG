import requests
import json

def test_naver_history(symbol, is_us=False):
    print(f"Testing Naver history for {symbol} (US={is_us})")
    headers = {"User-Agent": "Mozilla/5.0"}
    
    if not is_us:
        # KR Stock
        url = f"https://m.stock.naver.com/api/stock/{symbol}/price?pageSize=20"
    else:
        # US Stock - Need to find the right suffix first or try common ones
        # For testing, let's try AAPL.O (Nasdaq)
        url = f"https://api.stock.naver.com/stock/{symbol}/price?pageSize=20"

    try:
        resp = requests.get(url, headers=headers, timeout=5)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"Found {len(data)} items (List format)")
                if data: print("First item:", data[0])
            elif isinstance(data, dict):
                print("Dict format detected")
                # Some APIs return { 'result': [...] }
                items = data.get('result', [])
                print(f"Found {len(items)} items in 'result'")
                if items: print("First item:", items[0])
            else:
                print("Unknown format:", type(data))
        else:
            print("Failed to fetch")
    except Exception as e:
        print(f"Error: {e}")
    print("-" * 30)

if __name__ == "__main__":
    test_naver_history("005930") # Samsung
    test_naver_history("AAPL.O", is_us=True) # Apple
    test_naver_history("BLK", is_us=True) # BlackRock (without suffix)
    test_naver_history("BLK.N", is_us=True) # BlackRock (with NYSE suffix)
