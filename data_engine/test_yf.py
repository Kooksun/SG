import yfinance as yf
import pandas as pd
from datetime import datetime

def test_history(symbol, period="1y"):
    print(f"Testing {symbol} with period={period}")
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period=period, interval="1d")
    if hist.empty:
        print(f"No data found for {symbol}")
        return
    print(f"Data found: {len(hist)} rows")
    print("First row:", hist.index[0], hist.iloc[0]['Close'])
    print("Last row:", hist.index[-1], hist.iloc[-1]['Close'])
    print("-" * 30)

if __name__ == "__main__":
    test_history("COST")
    test_history("GS")
    # Test with .KS for GS if it was treated as KR previously
    test_history("GS.KS")
