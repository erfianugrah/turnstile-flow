-- Migration 004: Fingerprint baselines cache
CREATE TABLE IF NOT EXISTS fingerprint_baselines (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL,
	fingerprint_key TEXT NOT NULL,
	ja4_bucket TEXT NOT NULL,
	asn_bucket INTEGER NOT NULL,
	hit_count INTEGER DEFAULT 1,
	last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
	metadata TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fingerprint_baselines_unique
	ON fingerprint_baselines(type, fingerprint_key, ja4_bucket, asn_bucket);
