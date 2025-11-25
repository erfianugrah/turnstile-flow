-- Submissions table: stores form submission data with rich metadata
CREATE TABLE IF NOT EXISTS submissions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Form fields
	first_name TEXT NOT NULL,
	last_name TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE,
	phone TEXT, -- Optional: international phone number
	address TEXT, -- Optional: JSON object with {street, street2, city, state, postalCode, country}
	date_of_birth TEXT, -- Optional: YYYY-MM-DD format
	-- Turnstile & fraud detection
	ephemeral_id TEXT,
	-- Request metadata
	remote_ip TEXT,
	user_agent TEXT,
	country TEXT,
	region TEXT,
	city TEXT,
	postal_code TEXT,
	timezone TEXT,
	latitude TEXT,
	longitude TEXT,
	continent TEXT,
	is_eu_country TEXT,
	-- Network metadata
	asn INTEGER,
	as_organization TEXT,
	colo TEXT,
	http_protocol TEXT,
	tls_version TEXT,
	tls_cipher TEXT,
	-- Bot detection
	bot_score INTEGER,
	client_trust_score INTEGER,
	verified_bot BOOLEAN DEFAULT FALSE,
	detection_ids TEXT, -- JSON array
	-- Fingerprints
	ja3_hash TEXT,
	ja4 TEXT,
	ja4_signals TEXT, -- JSON object
	-- Email fraud detection (Phase 2)
	email_risk_score REAL, -- 0.0-1.0
	email_fraud_signals TEXT, -- JSON: markov, disposable, tld, ood
	email_pattern_type TEXT, -- sequential, dated, formatted, etc.
	email_markov_detected INTEGER, -- 0 or 1
	email_ood_detected INTEGER, -- 0 or 1
	-- Risk scoring breakdown (Phase 2)
	risk_score_breakdown TEXT, -- JSON: component scores for transparency
	-- Payload-agnostic forms (Phase 3)
	form_data TEXT, -- Complete raw JSON payload
	extracted_email TEXT, -- Extracted email for querying
	extracted_phone TEXT, -- Extracted phone for querying
	request_headers TEXT, -- JSON snapshot of request headers (sans secrets)
	extended_metadata TEXT, -- JSON blob of full RequestMetadata for fingerprinting
	-- Request tracking
	erfid TEXT, -- Unique request identifier for lifecycle tracking
	-- Timestamps
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Turnstile validations table: stores validation attempts and prevents token replay
CREATE TABLE IF NOT EXISTS turnstile_validations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Turnstile validation
	token_hash TEXT NOT NULL,
	success BOOLEAN NOT NULL,
	allowed BOOLEAN NOT NULL,
	block_reason TEXT,
	challenge_ts TEXT,
	hostname TEXT,
	action TEXT,
	ephemeral_id TEXT,
	risk_score INTEGER DEFAULT 0,
	error_codes TEXT,
	submission_id INTEGER,
	-- Request metadata
	remote_ip TEXT,
	user_agent TEXT,
	country TEXT,
	region TEXT,
	city TEXT,
	postal_code TEXT,
	timezone TEXT,
	continent TEXT,
	is_eu_country TEXT,
	-- Network metadata
	asn INTEGER,
	as_organization TEXT,
	colo TEXT,
	http_protocol TEXT,
	tls_version TEXT,
	-- Bot detection (from request.cf.botManagement)
	bot_score INTEGER,
	client_trust_score INTEGER,
	verified_bot BOOLEAN DEFAULT FALSE,
	js_detection_passed BOOLEAN DEFAULT FALSE,
	detection_ids TEXT, -- JSON array
	-- Fingerprints
	ja3_hash TEXT,
	ja4 TEXT,
	ja4_signals TEXT, -- JSON object with h2h3_ratio_1h, heuristic_ratio_1h, etc.
	-- Detection metadata (Phase 2)
	detection_type TEXT, -- Primary detection layer: email_fraud_detection, ephemeral_id_tracking, ja4_fingerprinting, token_replay_protection, turnstile_validation
	risk_score_breakdown TEXT, -- JSON: component scores for transparency
	request_headers TEXT, -- JSON snapshot of request headers (sans secrets)
	extended_metadata TEXT, -- JSON blob of full RequestMetadata for fingerprinting
	-- Request tracking
	erfid TEXT, -- Unique request identifier for lifecycle tracking
	-- Timestamps
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

-- Fraud detection blacklist table
-- Stores blocked emails, ephemeral IDs, IPs, and JA4 fingerprints for pre-validation blocking
CREATE TABLE IF NOT EXISTS fraud_blacklist (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Identifiers (at least one must be present)
	ephemeral_id TEXT,
	ip_address TEXT,
	ja4 TEXT,
	email TEXT,
	-- Block metadata
	block_reason TEXT NOT NULL,
	detection_confidence TEXT NOT NULL CHECK(detection_confidence IN ('high', 'medium', 'low')),
	risk_score REAL,
	risk_score_breakdown TEXT,
	-- Timing
	blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	expires_at DATETIME NOT NULL,
	-- Detection context
	submission_count INTEGER DEFAULT 0,
	last_seen_at DATETIME,
	-- Pattern metadata (JSON)
	detection_metadata TEXT,
	-- Detection type: Primary detection layer that triggered blacklisting
	detection_type TEXT,
	-- Request tracking
	erfid TEXT, -- Unique request identifier that triggered this blacklist entry
	-- Constraints: at least one identifier must be present
	CHECK((ephemeral_id IS NOT NULL) OR (ip_address IS NOT NULL) OR (ja4 IS NOT NULL) OR (email IS NOT NULL))
);

-- Fraud blocks table (Phase 1: Email Fraud Logging)
-- Stores fraud blocks that occur BEFORE Turnstile validation
-- (e.g., email fraud, IP reputation, etc.)
-- Complements turnstile_validations which captures blocks AFTER validation
CREATE TABLE IF NOT EXISTS fraud_blocks (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Detection information
	detection_type TEXT NOT NULL,           -- Primary detection layer: email_fraud_detection, pre_validation_blacklist, etc.
	block_reason TEXT NOT NULL,             -- Human-readable reason
	risk_score REAL NOT NULL,               -- 0-100 scale
	-- Request metadata (minimal, can expand as needed)
	remote_ip TEXT NOT NULL,
	user_agent TEXT,
	country TEXT,
	-- Email fraud specific (nullable for other detection types)
	email_pattern_type TEXT,                -- 'sequential', 'dated', 'formatted', etc.
	email_markov_detected INTEGER,          -- 0 or 1
	email_ood_detected INTEGER,             -- 0 or 1 (Out-of-Distribution)
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

-- Fingerprint baselines table: caches known-safe header/TLS fingerprints
CREATE TABLE IF NOT EXISTS fingerprint_baselines (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL, -- 'header' or 'tls'
	fingerprint_key TEXT NOT NULL,
	ja4_bucket TEXT NOT NULL,
	asn_bucket INTEGER NOT NULL,
	hit_count INTEGER DEFAULT 1,
	last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
	metadata TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fingerprint_baselines_unique
	ON fingerprint_baselines(type, fingerprint_key, ja4_bucket, asn_bucket);

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_hash ON turnstile_validations(token_hash);
CREATE INDEX IF NOT EXISTS idx_ephemeral_id ON turnstile_validations(ephemeral_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON turnstile_validations(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_ephemeral_id ON submissions(ephemeral_id);
CREATE INDEX IF NOT EXISTS idx_submissions_email ON submissions(email);
CREATE INDEX IF NOT EXISTS idx_submissions_country ON submissions(country);
CREATE INDEX IF NOT EXISTS idx_submissions_ja3 ON submissions(ja3_hash);
CREATE INDEX IF NOT EXISTS idx_submissions_ja4 ON submissions(ja4);
CREATE INDEX IF NOT EXISTS idx_validations_country ON turnstile_validations(country);
CREATE INDEX IF NOT EXISTS idx_validations_bot_score ON turnstile_validations(bot_score);
CREATE INDEX IF NOT EXISTS idx_validations_ja3 ON turnstile_validations(ja3_hash);
CREATE INDEX IF NOT EXISTS idx_validations_ja4 ON turnstile_validations(ja4);
CREATE INDEX IF NOT EXISTS idx_blacklist_ephemeral_id ON fraud_blacklist(ephemeral_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_blacklist_ip ON fraud_blacklist(ip_address, expires_at);
CREATE INDEX IF NOT EXISTS idx_blacklist_ja4 ON fraud_blacklist(ja4, expires_at);
CREATE INDEX IF NOT EXISTS idx_blacklist_email ON fraud_blacklist(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_blacklist_expires ON fraud_blacklist(expires_at);
CREATE INDEX IF NOT EXISTS idx_submissions_email_pattern ON submissions(email_pattern_type);
-- Phase 3: Indexes for extracted fields
CREATE INDEX IF NOT EXISTS idx_submissions_extracted_email ON submissions(extracted_email);
CREATE INDEX IF NOT EXISTS idx_submissions_extracted_phone ON submissions(extracted_phone);
-- Phase 1: Indexes for fraud_blocks table
CREATE INDEX IF NOT EXISTS idx_fraud_blocks_detection_type ON fraud_blocks(detection_type);
CREATE INDEX IF NOT EXISTS idx_fraud_blocks_created_at ON fraud_blocks(created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_blocks_remote_ip ON fraud_blocks(remote_ip);
CREATE INDEX IF NOT EXISTS idx_fraud_blocks_country ON fraud_blocks(country);
-- Phase 1.5: Indexes for detection_type analytics
CREATE INDEX IF NOT EXISTS idx_validations_detection_type ON turnstile_validations(detection_type);
CREATE INDEX IF NOT EXISTS idx_blacklist_detection_type ON fraud_blacklist(detection_type);
-- Phase 1.1: Indexes for erfid tracking
CREATE INDEX IF NOT EXISTS idx_submissions_erfid ON submissions(erfid);
CREATE INDEX IF NOT EXISTS idx_validations_erfid ON turnstile_validations(erfid);
CREATE INDEX IF NOT EXISTS idx_blacklist_erfid ON fraud_blacklist(erfid) WHERE erfid IS NOT NULL;
