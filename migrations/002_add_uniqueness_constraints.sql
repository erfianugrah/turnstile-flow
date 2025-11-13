-- Migration: Add uniqueness constraints to prevent duplicate submissions
-- Date: 2025-11-13
-- Description: Add UNIQUE constraints on email and phone to prevent duplicate registrations

-- Note: SQLite doesn't support ALTER TABLE ADD CONSTRAINT for UNIQUE
-- So we need to recreate the table with constraints

-- 1. Create new table with constraints
CREATE TABLE IF NOT EXISTS submissions_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Form fields
	first_name TEXT NOT NULL,
	last_name TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE,  -- ✅ UNIQUE: One email = one submission
	phone TEXT NOT NULL UNIQUE,  -- ✅ UNIQUE: One phone = one submission
	address TEXT NOT NULL,
	date_of_birth TEXT NOT NULL,
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
	-- Timestamps
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Copy existing data (will fail on duplicates, which is what we want to identify)
INSERT INTO submissions_new
SELECT * FROM submissions;

-- 3. Drop old table
DROP TABLE submissions;

-- 4. Rename new table
ALTER TABLE submissions_new RENAME TO submissions;

-- 5. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_ephemeral_id ON submissions(ephemeral_id);
CREATE INDEX IF NOT EXISTS idx_submissions_email ON submissions(email);
CREATE INDEX IF NOT EXISTS idx_submissions_phone ON submissions(phone);  -- ✅ NEW: Index on phone
CREATE INDEX IF NOT EXISTS idx_submissions_country ON submissions(country);
CREATE INDEX IF NOT EXISTS idx_submissions_ja3 ON submissions(ja3_hash);
CREATE INDEX IF NOT EXISTS idx_submissions_ja4 ON submissions(ja4);

-- 6. Add composite index for identity matching (fraud detection)
-- Useful for finding users who might be the same person
CREATE INDEX IF NOT EXISTS idx_submissions_identity
ON submissions(first_name, last_name, date_of_birth);
