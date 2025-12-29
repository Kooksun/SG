import FinanceDataReader as fdr
import pandas as pd

indices = {
    'KOSPI': 'KS11',
    'KOSDAQ': 'KQ11',
    'S&P 500': 'US500',
    'Nasdaq': 'IXIC',
    'Dow Jones': 'DJI'
}

results = {}
for name, sym in indices.items():
    try:
        df = fdr.DataReader(sym)
        if df.empty:
            results[name] = "Empty Data"
            continue
        last = df.iloc[-1]
        prev = df.iloc[-2]
        results[name] = {
            'price': float(last['Close']),
            'change': float(last['Close'] - prev['Close']),
            'percent': float((last['Close'] - prev['Close']) / prev['Close'] * 100)
        }
    except Exception as e:
        results[name] = str(e)

print(results)
