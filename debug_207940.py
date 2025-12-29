import os
import sys
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from data_engine.fetcher import fetch_stock_history
from data_engine.supabase_client import get_supabase

def debug_207940():
    symbol = "207940"
    print(f"--- Debugging {symbol} (Samsung Biologics) ---")
    
    supabase = get_supabase()
    if not supabase:
        print("Supabase client not initialized.")
        return

    # 1. Query Supabase for November data
    print("Querying Supabase for November data...")
    res = supabase.table("stock_history") \
        .select("*") \
        .eq("symbol", symbol) \
        .gte("time", "2025-11-01") \
        .lte("time", "2025-11-30") \
        .order("time", desc=False) \
        .execute()
    
    if res.data:
        print(f"Found {len(res.data)} records in November.")
        for row in res.data:
            print(f"  {row['time']}: O:{row['open']}, H:{row['high']}, L:{row['low']}, C:{row['close']}")
    else:
        print("No records found in November in Supabase.")

    # 2. Fetch from yfinance
    print("\nFetching fresh data from yfinance...")
    history_data = fetch_stock_history(symbol)
    if history_data:
        nov_data = [d for d in history_data if d['time'].startswith("2025-11")]
        print(f"yfinance returned {len(nov_data)} records for November.")
        for d in nov_data:
             print(f"  {d['time']}: {d['close']}")
    else:
        print("yfinance returned no data.")

    # 3. Fetch from FinanceDataReader
    print("\nFetching data from FinanceDataReader...")
    try:
        import FinanceDataReader as fdr
        df_fdr = fdr.DataReader(symbol, start="2025-11-01", end="2025-11-30")
        if not df_fdr.empty:
            print(f"FDR returned {len(df_fdr)} records for November.")
            for date, row in df_fdr.iterrows():
                print(f"  {date.strftime('%Y-%m-%d')}: Close={row['Close']}")
        else:
            print("FDR returned no data.")
    except Exception as e:
        print(f"FDR error: {e}")

if __name__ == "__main__":
    debug_207940()
