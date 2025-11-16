-- Phase 3: Payload-Agnostic Forms Migration
-- Adds support for storing raw JSON payloads while maintaining backwards compatibility

-- Add form_data column to store entire payload as JSON
ALTER TABLE submissions ADD COLUMN form_data TEXT;

-- Add extracted field columns for querying
-- These are populated by the field mapper from the raw payload
ALTER TABLE submissions ADD COLUMN extracted_email TEXT;
ALTER TABLE submissions ADD COLUMN extracted_phone TEXT;

-- Create indexes on extracted fields for efficient querying
CREATE INDEX IF NOT EXISTS idx_submissions_extracted_email ON submissions(extracted_email);
CREATE INDEX IF NOT EXISTS idx_submissions_extracted_phone ON submissions(extracted_phone);

-- Note: Existing columns (first_name, last_name, email, etc.) remain for backwards compatibility
-- Phase 3 code will populate BOTH old columns AND new form_data/extracted_* columns
