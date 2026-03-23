-- Email auth: add email column, make phone nullable for migration
-- TZ: switch to email-only auth; keep phone for backward compat with existing data

-- Add email column (nullable for safe migration; new installs can use NOT NULL later)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

-- Index for email lookups (partial: only where email is set)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- Make phone nullable (existing users have phone; new users will use email only)
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
