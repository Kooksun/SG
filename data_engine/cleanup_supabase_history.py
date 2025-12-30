import os
import sys
import argparse
from supabase_client import get_supabase

def cleanup_history(symbol, before_date=None, dry_run=True):
    print(f"--- Cleanup history for {symbol} ---")
    supabase = get_supabase()
    if not supabase:
        print("Error: Supabase client not available.")
        return

    query = supabase.table("stock_history").select("id, time").eq("symbol", symbol)
    if before_date:
        query = query.lt("time", before_date)
    
    response = query.order("time", desc=False).execute()
    data = response.data
    
    if not data:
        print(f"No records found for {symbol}" + (f" before {before_date}" if before_date else ""))
        return

    print(f"Found {len(data)} records to delete.")
    if len(data) > 0:
        print(f"Sample: {data[0]['time']} ~ {data[-1]['time']}")

    if dry_run:
        print("DRY RUN: No records deleted. Use --execute to actually delete.")
    else:
        confirm = input(f"Are you sure you want to delete {len(data)} records for {symbol}? (y/n): ")
        if confirm.lower() == 'y':
            try:
                # Supabase delete doesn't support 'lt' directly in the same call easily in some versions, 
                # but we can delete by IDs or re-apply the filter.
                delete_query = supabase.table("stock_history").delete().eq("symbol", symbol)
                if before_date:
                    delete_query = delete_query.lt("time", before_date)
                
                del_resp = delete_query.execute()
                print(f"SUCCESS: Deleted records for {symbol}.")
            except Exception as e:
                print(f"FAILURE: Error during deletion: {e}")
        else:
            print("Deletion cancelled.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cleanup Supabase stock history")
    parser.add_argument("symbol", help="Stock symbol to cleanup")
    parser.add_argument("--before", help="Delete records before this date (YYYY-MM-DD)")
    parser.add_argument("--execute", action="store_true", help="Actually execute deletion")
    
    args = parser.parse_args()
    
    cleanup_history(args.symbol, args.before, dry_run=not args.execute)
