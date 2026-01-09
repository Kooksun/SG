import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from supabase_client import get_supabase
from datetime import datetime

def test_insert():
    supabase = get_supabase()
    if not supabase:
        print("Error: Supabase client not initialized.")
        return

    test_data = {
        'uid': 'test_user_col_check',
        'total_assets': 1000000,
        'rank': 999,
        'recorded_at': datetime.now().isoformat(),
        'comment': 'Checking if this column is added automatically'
    }

    print(f"Attempting to insert test data: {test_data}")
    try:
        response = supabase.table("user_ranking_history").insert(test_data).execute()
        print("Success! Response:")
        print(response)
        
        # Cleanup
        print("Cleaning up test data...")
        supabase.table("user_ranking_history").delete().eq('uid', 'test_user_col_check').execute()
        print("Done.")
    except Exception as e:
        print(f"Failed to insert data: {e}")
        print("\nThis usually means the column 'comment' does not exist and Supabase doesn't add it automatically.")

if __name__ == "__main__":
    test_insert()
