
import os
import FinanceDataReader as fdr
import pandas as pd

def check_reserved():
    # 1. Check File Reading
    reserved_file = 'data_engine/reserved_symbols.txt'
    if not os.path.exists(reserved_file):
        print(f"Error: {reserved_file} not found.")
        return

    reserved_symbols = set()
    with open(reserved_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            reserved_symbols.add(line)
    
    print(f"Read symbols from file: {reserved_symbols}")

    # 2. Check Data Fetching
    print("Fetching StockListing('KRX')...")
    df = fdr.StockListing('KRX')
    print(f"Total KRX stocks: {len(df)}")
    
    # Filter as done in fetcher.py
    df = df[df['Market'].isin(['KOSPI', 'KOSDAQ'])]
    df['Code'] = df['Code'].astype(str)
    print(f"Filtered (KOSPI/KOSDAQ): {len(df)}")

    # Check existence
    for sym in reserved_symbols:
        found = df[df['Code'] == sym]
        if not found.empty:
            print(f"[OK] Symbol {sym} found: {found.iloc[0]['Name']} ({found.iloc[0]['Market']})")
        else:
            print(f"[FAIL] Symbol {sym} NOT found in KOSPI/KOSDAQ market filter.")
            # Check if it exists in raw df
            raw_found = fdr.StockListing('KRX')
            raw_found['Code'] = raw_found['Code'].astype(str)
            match = raw_found[raw_found['Code'] == sym]
            if not match.empty:
                 print(f"      -> But found in raw list: {match.iloc[0]['Name']} ({match.iloc[0]['Market']})")
            else:
                 print(f"      -> Not found in KRX listing at all.")

if __name__ == "__main__":
    check_reserved()
