import requests
import json

def test_digital_more():
    urls = [
        'https://api.stock.naver.com/marketindex/majors/recent',
        'https://api.stock.naver.com/marketindex/digitalCoinPrice.nhn',
        'https://m.stock.naver.com/api/marketindex/majors/recent',
        'https://api.stock.naver.com/marketindex/majors/digital',
    ]
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    for url in urls:
        print(f"\nTesting URL: {url}")
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                print(json.dumps(data, indent=2, ensure_ascii=False)[:2000])
            else:
                print(f"Status: {resp.status_code}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    test_digital_more()
