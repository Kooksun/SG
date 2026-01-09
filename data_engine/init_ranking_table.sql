-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS user_ranking_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uid TEXT NOT NULL,
    total_assets BIGINT NOT NULL,
    rank INTEGER NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    comment TEXT
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_ranking_history_recorded_at ON user_ranking_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_ranking_history_uid ON user_ranking_history(uid);
