
from supabase_client import get_supabase
import sys

def check_stock_data(symbol):
    supabase = get_supabase()
    if not supabase:
        print("Failed to connect to Supabase.")
        return

    try:
        response = supabase.table("stock_history").select("count", count="exact").eq("symbol", symbol).execute()
        count = response.count
        print(f"Stock {symbol} has {count} records in stock_history.")
        
        if count > 0:
            latest = supabase.table("stock_history").select("*").eq("symbol", symbol).order("time", descending=True).limit(5).execute()
            print("Latest 5 records:")
            for row in latest.data:
                print(row)
    except Exception as e:
        print(f"Error checking data: {e}")

if __name__ == "__main__":
    symbol = "484870" if len(sys.argv) < 2 else sys.argv[1]
    check_stock_data(symbol)
