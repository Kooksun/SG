
import FinanceDataReader as fdr
import pandas as pd

def check_specific_stocks():
    targets = ['041510', '122870', '035900']
    print(f"Checking targets: {targets}")
    
    print("Fetching StockListing('KRX')...")
    df = fdr.StockListing('KRX')
    
    # Ensure code is string
    df['Code'] = df['Code'].astype(str)
    
    print(f"Total KRX items: {len(df)}")
    
    for code in targets:
        row = df[df['Code'] == code]
        if row.empty:
            print(f"[FAIL] {code}: Not found in KRX listing at all.")
        else:
            item = row.iloc[0]
            print(f"[OK] {code}: Found. Name='{item['Name']}', Market='{item['Market']}'")
            
            if item['Market'] not in ['KOSPI', 'KOSDAQ']:
                print(f"    -> WARNING: Market is {item['Market']}, not KOSPI/KOSDAQ. It will be filtered out by fetcher.py!")

if __name__ == "__main__":
    check_specific_stocks()
