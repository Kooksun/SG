import argparse
import sys
import os

# Ensure we can import from local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import firestore_client  # Initializes Firebase
    from firebase_admin import db
except ImportError:
    print("Error: Could not import firebase modules. Make sure you are in the right environment.")
    sys.exit(1)

try:
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    from datetime import datetime
except ImportError:
    print("Error: matplotlib is required. Please install it: pip install matplotlib")
    sys.exit(1)

def verify_chart(symbol):
    print(f"Verifying chart data for {symbol}...")
    
    # 1. Fetch from RTDB
    ref = db.reference(f'stock_history/{symbol}')
    data = ref.get()
    
    if not data:
        print(f"No history data found for {symbol} in RTDB.")
        return

    print(f"Found {len(data)} data points. preparing chart...")
    
    # 2. Parse Data
    dates = []
    closes = []
    highs = []
    lows = []
    
    for item in data:
        # item: {time: 'YYYY-MM-DD', open: ..., ...}
        dt = datetime.strptime(item['time'], '%Y-%m-%d')
        dates.append(dt)
        closes.append(item['close'])
        highs.append(item['high'])
        lows.append(item['low'])
        
    # 3. Plot
    plt.figure(figsize=(10, 6))
    plt.plot(dates, closes, label='Close', color='blue', linewidth=1)
    plt.fill_between(dates, lows, highs, color='gray', alpha=0.3, label='High/Low')
    
    plt.title(f'Stock Price History - {symbol}')
    plt.xlabel('Date')
    plt.ylabel('Price')
    plt.legend()
    plt.grid(True)
    
    # Format dates
    plt.gca().xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
    plt.gca().xaxis.set_major_locator(mdates.AutoDateLocator())
    plt.gcf().autofmt_xdate()
    
    filename = f"chart_{symbol}.png"
    plt.savefig(filename)
    print(f"Chart saved to {filename}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify stock history data by generating a chart image.")
    parser.add_argument("--symbol", type=str, required=True, help="Stock symbol (e.g., 005930, AAPL)")
    args = parser.parse_args()
    
    verify_chart(args.symbol)
