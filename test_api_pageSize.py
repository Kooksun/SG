import requests
import json

def test_api(symbol, page_size):
    headers = {"User-Agent": "Mozilla/5.0"}
    url = f"https://m.stock.naver.com/api/stock/{symbol}/price?pageSize={page_size}&page=1"
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        print(f"URL: {url}")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Returned Items: {len(data)}")
            if len(data) > 0:
                print(f"First Item Date: {data[0].get('localTradedAt')}")
                print(f"Last Item Date: {data[-1].get('localTradedAt')}")
        else:
            print(f"Response: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

print("--- Testing with pageSize=60 ---")
test_api("005930", 60)
print("\n--- Testing with pageSize=120 ---")
test_api("005930", 120)
