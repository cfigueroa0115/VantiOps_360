-- ============================================================
-- Migration 010: Create audit_events table (append-only)
-- Purpose: Immutable audit log with revoked UPDATE/DELETE
-- Requirements: REQ-14.1, REQ-14.2, REQ-14.4, REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(500) NOT NULL,
  resource_id VARCHAR(200),
  result VARCHAR(10) NOT NULL DEFAULT 'success'
    CHECK (result IN ('success', 'failure')),
  ip_address INET,
  details JSONB,
  correlation_id UUID
);

-- Index on timestamp for time-range queries
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp);

-- Index on user_id for user-based audit lookups
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);

-- Index on action for filtering by action type
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);

-- Index on resource for filtering by resource type
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource);

-- CRITICAL: Enforce append-only behavior — prevent UPDATE and DELETE
-- Rule to prevent UPDATE operations on audit_events
CREATE OR REPLACE RULE audit_events_no_update AS
  ON UPDATE TO audit_events
  DO INSTEAD NOTHING;

-- Rule to prevent DELETE operations on audit_events
CREATE OR REPLACE RULE audit_events_no_delete AS
  ON DELETE TO audit_events
  DO INSTEAD NOTHING;

-- DOWN
-- ============================================================

-- Remove the append-only rules first
DROP RULE IF EXISTS audit_events_no_update ON audit_events;
DROP RULE IF EXISTS audit_events_no_delete ON audit_events;
DROP TABLE IF EXISTS audit_events CASCADE;
