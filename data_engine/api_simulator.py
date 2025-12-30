import requests
import time
from typing import List, Dict

# Example subset of 150 tickers
TEST_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX", "AMD", "INTC",
    "QQQ", "SPY", "SOXL", "TQQQ", "PLTR", "COIN", "HOOD", "MSTR", "IONQ", "RIVN",
    "AVGO", "ORCL", "CRM", "ADBE", "CSCO", "PEP", "KO", "COST", "WMT", "DIS",
    "NKE", "SBUX", "MCD", "JPM", "BAC", "V", "MA", "PYPL", "UBER", "ABNB",
    "LCID", "U", "RBLX", "OPEN", "SOFI", "AFRM", "UPST", "DKNG", "AI", "SQQQ",
    "SOXS", "BITI", "PSQ", "TSM", "ASML", "MU", "ARM", "MRVL", "QCOM", "LRCX",
    "KLAC", "SNPS", "CDNS", "ADI", "TXN", "ON", "MCHP", "SMCI", "SNOW", "MDB",
    "DDOG", "NET", "PANW", "CRWD", "ZS", "NOW", "WDAY", "INTU", "TTD", "SHOP",
    "TEAM", "OKTA", "PATH", "WFC", "GS", "MS", "AXP", "SCHW", "NU", "BLK",
    "BX", "MARA", "RIOT", "CLSK", "MCO", "LLY", "NVO", "UNH", "JNJ", "PFE",
    "MRK", "ABBV", "AMGN", "ISRG", "MRNA", "VRTX", "BIIB", "LULU", "CMG", "BKNG",
    "EXPE", "DAL", "AAL", "CCL", "RCL", "MAR", "H", "ELF", "MNST", "MDLZ",
    "LOW", "TJX", "XOM", "CVX", "OXY", "CAT", "DE", "BA", "GE", "RTX",
    "LMT", "F", "GM", "UPS", "JEPI", "SCHD", "VOO", "IVV", "VTI", "BND",
    "AGG", "GLD", "SLV", "DIA", "IWM", "UPRO", "TNA", "BULZ", "TECL", "USD",
    "NVDL", "SPXS", "SDOW", "FAZ", "TZA", "SH", "VIXY", "UVXY"
]

def simulate_fetch(tickers: List[str]):
    headers = {"User-Agent": "Mozilla/5.0"}
    results = []
    start_time = time.time()
    
    print(f"Starting simulation for {len(tickers)} tickers...")
    
    for i, ticker in enumerate(tickers):
        # We simulate the suffix search or use a known one. 
        # For simulation, let's just try '.O' (Nasdaq) as it's common.
        symbol = f"{ticker}.O"
        url = f"https://api.stock.naver.com/stock/{symbol}/basic"
        
        req_start = time.time()
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            latency = time.time() - req_start
            status = resp.status_code
            if status != 200:
                # Try without suffix if .O fails (NYSE often has no suffix or .N)
                resp = requests.get(f"https://api.stock.naver.com/stock/{ticker}.N/basic", headers=headers, timeout=5)
                status = resp.status_code
        except Exception as e:
            latency = time.time() - req_start
            status = f"Error: {e}"
        
        results.append({
            "ticker": ticker,
            "status": status,
            "latency": latency
        })
        
        if i % 10 == 0 and i > 0:
            avg_latency = sum(r['latency'] for r in results) / len(results)
            print(f"Processed {i}/{len(tickers)}... Avg Latency: {avg_latency:.2f}s")
            
        # Throttling simulate
        time.sleep(0.1)
        
    end_time = time.time()
    total_time = end_time - start_time
    
    success_count = len([r for r in results if r['status'] == 200])
    fail_count = len(results) - success_count
    avg_lat = sum(r['latency'] for r in results) / len(results)
    
    print("\n--- Simulation Results ---")
    print(f"Total Tickers: {len(tickers)}")
    print(f"Success: {success_count}")
    print(f"Fail: {fail_count}")
    print(f"Average Latency: {avg_lat:.2f}s")
    print(f"Total Execution Time: {total_time:.2f}s")
    
    if total_time > 60:
        print("WARNING: Total time exceeds 1 minute! Optimization or longer intervals needed.")
    else:
        print("SUCCESS: Within 1 minute window.")

if __name__ == "__main__":
    simulate_fetch(TEST_TICKERS)
