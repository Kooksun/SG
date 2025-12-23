import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from scheduler_rtdb import record_ranking_history, fetch_job

if __name__ == "__main__":
    print("Testing record_ranking_history using venv...")
    try:
        # We need to fetch current prices first to have data for ranking
        print("Fetching current stocks...")
        fetch_job()
        print("Recording ranking history...")
        record_ranking_history()
        print("Test complete.")
    except Exception as e:
        print(f"Error during test: {e}")
        import traceback
        traceback.print_exc()
