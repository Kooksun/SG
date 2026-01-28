
def calculate_equity(balance, used_credit, short_initial_value, long_value, short_current_value):
    # holdings_value in our code is (LongValue - CurrentShortValue)
    holdings_value = long_value - short_current_value
    
    # Current (potentially buggy) formula:
    # equity = balance + holdings_value - (used_credit - short_initial_value)
    buggy_equity = balance + holdings_value - (used_credit - short_initial_value)
    
    # Proposed corrected formula:
    # equity = balance + holdings_value - (used_credit - short_initial_value) + short_initial_value
    # which simplifies to:
    corrected_equity = balance + holdings_value - used_credit + 2 * short_initial_value
    # Wait, let's re-derive.
    # Net Liquidation = Cash + LongValue - ShortCurrentValue + ShortProceeds - LongDebt
    # In our system:
    # Balance = Cash (excludes short proceeds)
    # usedCredit = LongDebt + ShortInitialValue
    # ShortInitialValue = ShortProceeds
    # So: Equity = Balance + LongValue - ShortCurrentValue - (usedCredit - ShortInitialValue) + ShortInitialValue
    # Equity = Balance + LongValue - ShortCurrentValue - usedCredit + 2 * ShortInitialValue
    
    # Wait, let's test this.
    return buggy_equity, corrected_equity

def test():
    print(f"{'Scenario':<30} | {'Buggy':<15} | {'Corrected':<15} | {'Expected':<15}")
    print("-" * 85)
    
    # 1. Pure Cash
    # Balance 10M, no debt, no holdings
    b, c = calculate_equity(10, 0, 0, 0, 0)
    print(f"{'1. Pure Cash (10M)':<30} | {b:<15} | {c:<15} | {10:<15}")
    
    # 2. Long Position (Cash only)
    # Balance 0 (used 10M), Long Value 10M, no debt
    b, c = calculate_equity(0, 0, 0, 10, 0)
    print(f"{'2. Long (10M, No Debt)':<30} | {b:<15} | {c:<15} | {10:<15}")
    
    # 3. Long Position (Margin)
    # Balance 0, Long Buy 20M, Debt 10M.
    # Current Long Value 20M.
    # Expect Equity = 20M - 10M = 10M
    b, c = calculate_equity(0, 10, 0, 20, 0)
    print(f"{'3. Long (20M, 10M Debt)':<30} | {b:<15} | {c:<15} | {10:<15}")
    
    # 4. Short Position (Profit)
    # Balance 10M (Initial Cash). Shorted for 100M. 
    # used_credit = 100M. short_initial = 100M.
    # Current short value = 90M (Profit 10M).
    # Expected Equity = 10M (Cash) + 10M (Profit) = 20M
    b, c = calculate_equity(10, 100, 100, 0, 90)
    print(f"{'4. Short (100 -> 90, 10 Profit)':<30} | {b:<15} | {c:<15} | {20:<15}")
    
    # 5. Short Position (Loss)
    # Balance 10M. Shorted for 100M.
    # Current short value = 110M (Loss 10M).
    # Expected Equity = 10M - 10M = 0
    b, c = calculate_equity(10, 100, 100, 0, 110)
    print(f"{'5. Short (100 -> 110, 10 Loss)':<30} | {b:<15} | {c:<15} | {0:<15}")

if __name__ == "__main__":
    test()
