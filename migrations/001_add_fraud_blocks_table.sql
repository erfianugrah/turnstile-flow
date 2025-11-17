-- Migration: Add fraud_blocks table for pre-Turnstile fraud detection
-- Purpose: Log fraud blocks that happen BEFORE Turnstile validation (e.g., email fraud)
-- Created: 2025-11-17

CREATE TABLE IF NOT EXISTS fraud_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Detection information
    detection_type TEXT NOT NULL,           -- 'email_fraud', future: 'ip_reputation', etc.
    block_reason TEXT NOT NULL,             -- Human-readable reason
    risk_score REAL NOT NULL,               -- 0.0-1.0 or 0-100 depending on source

    -- Request metadata (minimal, can expand as needed)
    remote_ip TEXT NOT NULL,
    user_agent TEXT,
    country TEXT,

    -- Email fraud specific (nullable for other detection types)
    email_pattern_type TEXT,                -- 'sequential', 'dated', 'formatted', etc.
    email_markov_detected INTEGER,          -- 0 or 1
    email_ood_detected INTEGER,             -- 0 or 1
    email_disposable_domain INTEGER,        -- 0 or 1
    email_tld_risk_score REAL,              -- 0.0-1.0

    -- Full metadata JSON (for flexibility)
    metadata_json TEXT,                     -- JSON string of all request metadata
    fraud_signals_json TEXT,                -- JSON string of fraud detection signals

    -- Request tracking
    erfid TEXT,                             -- Request tracking ID

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fraud_blocks_detection_type ON fraud_blocks(detection_type);
CREATE INDEX IF NOT EXISTS idx_fraud_blocks_created_at ON fraud_blocks(created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_blocks_remote_ip ON fraud_blocks(remote_ip);
CREATE INDEX IF NOT EXISTS idx_fraud_blocks_country ON fraud_blocks(country);

-- Add comment explaining the table purpose
-- This table captures fraud blocks that occur BEFORE Turnstile validation
-- It complements turnstile_validations which captures blocks AFTER validation
