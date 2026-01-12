import sys
import os

# Add the current directory to sys.path to import fetcher
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fetcher import fetch_stock_history

def test_tecl_history():
    symbol = "TECL"
    print(f"Testing history fetch for {symbol}...")
    history = fetch_stock_history(symbol)
    
    if history:
        print(f"Success! Found {len(history)} data points.")
        print(f"First 5: {history[:5]}")
        print(f"Last 5: {history[-5:]}")
    else:
        print(f"Failed to fetch history for {symbol}.")

if __name__ == "__main__":
    test_tecl_history()
