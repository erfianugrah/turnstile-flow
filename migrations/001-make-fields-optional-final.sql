-- Migration: Make phone, address, and date_of_birth optional

PRAGMA foreign_keys=OFF;

ALTER TABLE submissions RENAME TO submissions_old;

CREATE TABLE submissions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	first_name TEXT NOT NULL,
	last_name TEXT NOT NULL,
	email TEXT NOT NULL,
	phone TEXT,
	address TEXT,
	date_of_birth TEXT,
	ephemeral_id TEXT,
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
	asn INTEGER,
	as_organization TEXT,
	colo TEXT,
	http_protocol TEXT,
	tls_version TEXT,
	tls_cipher TEXT,
	bot_score INTEGER,
	client_trust_score INTEGER,
	verified_bot BOOLEAN DEFAULT FALSE,
	detection_ids TEXT,
	ja3_hash TEXT,
	ja4 TEXT,
	ja4_signals TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO submissions SELECT * FROM submissions_old;

DROP TABLE submissions_old;

CREATE INDEX IF NOT EXISTS idx_ephemeral_id ON submissions(ephemeral_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email ON submissions(email);
CREATE INDEX IF NOT EXISTS idx_country ON submissions(country);
CREATE INDEX IF NOT EXISTS idx_ja3_hash ON submissions(ja3_hash);
CREATE INDEX IF NOT EXISTS idx_ja4 ON submissions(ja4);
CREATE INDEX IF NOT EXISTS idx_bot_score ON submissions(bot_score);

PRAGMA foreign_keys=ON;
