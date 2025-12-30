import os
import sys

# Add current directory to path to import fetcher
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fetcher import fetch_indices, fetch_exchange_rate

def verify_fetcher():
    print("--- Verifying fetch_exchange_rate ---")
    rate = fetch_exchange_rate()
    print(f"USD/KRW Rate: {rate}")
    
    print("\n--- Verifying fetch_indices ---")
    indices = fetch_indices()
    for name, data in indices.items():
        print(f"[{name}] Price: {data['price']}, Change: {data['change']} ({data['change_percent']}%)")

if __name__ == "__main__":
    verify_fetcher()
