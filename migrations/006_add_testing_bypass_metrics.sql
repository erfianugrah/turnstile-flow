-- Add testing bypass tracking to turnstile validations and submissions
ALTER TABLE turnstile_validations
	ADD COLUMN testing_bypass BOOLEAN NOT NULL DEFAULT 0;

ALTER TABLE submissions
	ADD COLUMN testing_bypass BOOLEAN NOT NULL DEFAULT 0;
