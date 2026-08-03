-- ============================================================
-- Migration 002: Create app_users table
-- Purpose: Store application users with email, status, expiration
-- Requirements: REQ-13.1, REQ-13.2, REQ-17.1, REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) UNIQUE NOT NULL,
  display_name VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,  -- NULL = no expiration; used for INTERN/CONTRACTOR auto-expire
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Index on email for authentication lookups
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);

-- Index on active status for filtering
CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(is_active);

-- Index on expiration for scheduled deactivation checks
CREATE INDEX IF NOT EXISTS idx_app_users_expires_at ON app_users(expires_at)
  WHERE expires_at IS NOT NULL;

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS app_users CASCADE;
