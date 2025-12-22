
from scheduler_rtdb import update_single_stock_history
import sys

def run_update(symbol):
    print(f"Running update for symbol: {symbol}")
    success = update_single_stock_history(symbol)
    if success:
        print(f"Successfully updated history for {symbol} in Supabase.")
    else:
        print(f"Failed to update history for {symbol}.")

if __name__ == "__main__":
    symbol = "484870" if len(sys.argv) < 2 else sys.argv[1]
    run_update(symbol)
