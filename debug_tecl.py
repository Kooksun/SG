import requests

headers = {"User-Agent": "Mozilla/5.0"}
ticker = "JPM"

for suffix in ['.O', '.N', '.A', '', '.K']:
    url = f"https://api.stock.naver.com/stock/{ticker}{suffix}/basic"
    resp = requests.get(url, headers=headers)
    print(f"Suffix: {suffix}, Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Stock Name: {data.get('stockName')}")
        print(f"  Exchange Code: {data.get('exchangeCode')}")
        print(f"  Market Territory: {data.get('marketTerritoryName')}")
        print(f"  Close Price: {data.get('closePrice')}")
        import json
        print(json.dumps(data, indent=2, ensure_ascii=False))
