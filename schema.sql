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
	detection_type TEXT, -- Layer-specific detection type (e.g., ja4_ip_clustering, ephemeral_id_fraud)
	risk_score_breakdown TEXT, -- JSON: component scores for transparency
	-- Timestamps
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

-- Fraud detection blacklist table
-- Stores blocked ephemeral IDs, IPs, and JA4 fingerprints for pre-validation blocking
CREATE TABLE IF NOT EXISTS fraud_blacklist (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Identifiers (at least one must be present)
	ephemeral_id TEXT,
	ip_address TEXT,
	ja4 TEXT,
	-- Block metadata
	block_reason TEXT NOT NULL,
	detection_confidence TEXT NOT NULL CHECK(detection_confidence IN ('high', 'medium', 'low')),
	-- Timing
	blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	expires_at DATETIME NOT NULL,
	-- Detection context
	submission_count INTEGER DEFAULT 0,
	last_seen_at DATETIME,
	-- Pattern metadata (JSON)
	detection_metadata TEXT,
	-- Detection type (Phase 1.5+: layer-specific fraud detection types)
	detection_type TEXT,
	-- Constraints: at least one identifier must be present
	CHECK((ephemeral_id IS NOT NULL) OR (ip_address IS NOT NULL) OR (ja4 IS NOT NULL))
);

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
CREATE INDEX IF NOT EXISTS idx_blacklist_expires ON fraud_blacklist(expires_at);
CREATE INDEX IF NOT EXISTS idx_submissions_email_pattern ON submissions(email_pattern_type);
-- Phase 3: Indexes for extracted fields
CREATE INDEX IF NOT EXISTS idx_submissions_extracted_email ON submissions(extracted_email);
CREATE INDEX IF NOT EXISTS idx_submissions_extracted_phone ON submissions(extracted_phone);