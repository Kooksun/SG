-- Create trade_records table for Season 3 Audit Log (Revised)
CREATE TABLE IF NOT EXISTS trade_records (
    id BIGSERIAL PRIMARY KEY,
    uid TEXT NOT NULL,
    symbol TEXT NOT NULL,
    stock_name TEXT,
    type TEXT NOT NULL, -- BUY, SELL
    price FLOAT NOT NULL,
    quantity INT NOT NULL,
    amount FLOAT NOT NULL,
    raw_fee FLOAT NOT NULL,       -- 원본 수수료 (0.2% 등)
    discount_amount FLOAT DEFAULT 0, -- 수수료 감면액
    final_fee FLOAT NOT NULL,      -- 실제 부과된 수수료
    balance_change FLOAT NOT NULL,
    stock_change INT NOT NULL,
    profit FLOAT DEFAULT 0,
    profit_ratio FLOAT DEFAULT 0,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_trade_records_uid ON trade_records(uid);
CREATE INDEX IF NOT EXISTS idx_trade_records_symbol ON trade_records(symbol);
CREATE INDEX IF NOT EXISTS idx_trade_records_timestamp ON trade_records(timestamp);
