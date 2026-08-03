-- ============================================================
-- Migration 008: Create approval_steps and approval_events tables
-- Purpose: Implement approval workflow with 72-hour expiration
-- Requirements: REQ-15.1, REQ-15.2, REQ-15.3, REQ-15.4, REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  approver_role VARCHAR(50) NOT NULL,  -- 'LEGAL_APPROVER' | 'VP_APPROVER'
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  approved_by UUID REFERENCES app_users(id),
  justification TEXT,  -- min 10 chars when approved/rejected
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,  -- created_at + 72 hours
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on application_id for fetching steps by application
CREATE INDEX IF NOT EXISTS idx_approval_steps_application_id ON approval_steps(application_id);

-- Index on status for filtering pending/expired approvals
CREATE INDEX IF NOT EXISTS idx_approval_steps_status ON approval_steps(status);

-- Index on expires_at for scheduled expiration checks
CREATE INDEX IF NOT EXISTS idx_approval_steps_expires_at ON approval_steps(expires_at)
  WHERE status = 'pending';

-- Index on approver_role for filtering by role
CREATE INDEX IF NOT EXISTS idx_approval_steps_approver_role ON approval_steps(approver_role);

-- Approval events (audit trail for approval workflow)
CREATE TABLE IF NOT EXISTS approval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL
    CHECK (event_type IN ('requested', 'approved', 'rejected', 'expired', 'reminded')),
  actor_id UUID REFERENCES app_users(id),
  actor_role VARCHAR(50),
  justification TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET
);

-- Index on step_id for fetching events by step
CREATE INDEX IF NOT EXISTS idx_approval_events_step_id ON approval_events(step_id);

-- Index on event_type for filtering
CREATE INDEX IF NOT EXISTS idx_approval_events_event_type ON approval_events(event_type);

-- Index on timestamp for chronological queries
CREATE INDEX IF NOT EXISTS idx_approval_events_timestamp ON approval_events(timestamp);

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS approval_events CASCADE;
DROP TABLE IF EXISTS approval_steps CASCADE;
