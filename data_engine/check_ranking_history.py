from supabase_client import get_supabase
import pandas as pd
from datetime import datetime, timedelta

def check_ranking_history():
    print("Checking Supabase for user_ranking_history...")
    supabase = get_supabase()
    if not supabase:
        print("Supabase client not available")
        return
    
    try:
        # Fetch more records to see history
        response = supabase.table("user_ranking_history").select("recorded_at").order("recorded_at", desc=True).limit(1000).execute()
        data = response.data
        if not data:
            print("No data found in user_ranking_history")
            return
        
        df = pd.DataFrame(data)
        df['recorded_at'] = pd.to_datetime(df['recorded_at'])
        df['kst_time'] = df['recorded_at'].dt.tz_convert('Asia/Seoul')
        
        unique_hours = df['kst_time'].dt.strftime('%Y-%m-%d %H:00').unique()
        print(f"Found {len(unique_hours)} unique hours in last 1000 records")
        print("Last 24 unique hours:")
        for h in unique_hours[:24]:
            count = len(df[df['kst_time'].dt.strftime('%Y-%m-%d %H:00') == h])
            print(f"  {h}: {count} records")

        # Check for gap between the oldest in the list and today
        oldest = df['kst_time'].min()
        newest = df['kst_time'].max()
        print(f"\nRange: {oldest} to {newest}")
        
    except Exception as e:
        print(f"Error querying Supabase: {e}")

if __name__ == "__main__":
    check_ranking_history()
