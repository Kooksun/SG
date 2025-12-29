
from fetcher import fetch_stock_history
import sys

def test_fetch(symbol):
    print(f"Testing fetch for symbol: {symbol}")
    data = fetch_stock_history(symbol)
    if not data:
        print("No data returned from fetch_stock_history.")
    else:
        print(f"Successfully fetched {len(data)} records.")
        print("First record:", data[0])
        print("Last record:", data[-1])

if __name__ == "__main__":
    symbol = "484870" if len(sys.argv) < 2 else sys.argv[1]
    test_fetch(symbol)
