-- ============================================================
-- Migration 003: Create sessions table
-- Purpose: Track user sessions for authentication and audit
-- Requirements: REQ-13.4, REQ-14.1, REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,  -- SHA-256 hash of JWT/session token
  ip_address INET,
  user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on user_id for session lookups by user
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Index on token hash for fast token validation
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);

-- Index on active sessions for cleanup queries
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at)
  WHERE is_active = true;

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS sessions CASCADE;
