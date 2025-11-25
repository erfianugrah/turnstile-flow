-- Adds request_headers and extended_metadata columns for richer fingerprint storage
ALTER TABLE submissions ADD COLUMN request_headers TEXT;
ALTER TABLE submissions ADD COLUMN extended_metadata TEXT;
ALTER TABLE turnstile_validations ADD COLUMN request_headers TEXT;
ALTER TABLE turnstile_validations ADD COLUMN extended_metadata TEXT;
