from supabase_client import get_supabase
import pandas as pd

def check_supabase(symbol):
    print(f"Checking Supabase for {symbol}...")
    supabase = get_supabase()
    if not supabase:
        print("Supabase client not available")
        return
    
    try:
        response = supabase.table("stock_history").select("*").eq("symbol", symbol).order("time", desc=False).execute()
        data = response.data
        if not data:
            print(f"No data found in Supabase for {symbol}")
            return
        
        print(f"Found {len(data)} rows for {symbol}")
        print("First row:", data[0])
        print("Last row:", data[-1])
        
        # Check for 1990 data
        old_data = [d for d in data if d['time'].startswith('1990')]
        if old_data:
            print(f"ALERT: Found {len(old_data)} rows from 1990!")
            print("Sample 1990 row:", old_data[0])
            
    except Exception as e:
        print(f"Error querying Supabase for {symbol}: {e}")

if __name__ == "__main__":
    check_supabase("COST")
    check_supabase("GS")
