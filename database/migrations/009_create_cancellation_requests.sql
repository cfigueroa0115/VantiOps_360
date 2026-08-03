-- ============================================================
-- Migration 009: Create cancellation_requests and cancellation_state_history tables
-- Purpose: Annulations state machine (6 states, valid transitions)
-- Requirements: REQ-16.1, REQ-16.2, REQ-16.3, REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS cancellation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  radicado VARCHAR(50) UNIQUE NOT NULL,
  pqr_id VARCHAR(50),
  current_state VARCHAR(20) NOT NULL DEFAULT 'Solicitada'
    CHECK (current_state IN ('Solicitada', 'En_Revision', 'Aprobada', 'Rechazada', 'En_Ejecucion', 'Cerrada')),
  requested_by UUID NOT NULL REFERENCES app_users(id),
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on current_state for filtering by state
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_current_state ON cancellation_requests(current_state);

-- Index on requested_by for user-based lookups
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_requester_id ON cancellation_requests(requested_by);

-- Index on pqr_id for linking to PQR records
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_pqr_record_id ON cancellation_requests(pqr_id);

-- Index on radicado for fast unique lookups
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_radicado ON cancellation_requests(radicado);

-- State history table for transition audit trail
CREATE TABLE IF NOT EXISTS cancellation_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cancellation_id UUID NOT NULL REFERENCES cancellation_requests(id) ON DELETE CASCADE,
  from_state VARCHAR(20) NOT NULL
    CHECK (from_state IN ('Solicitada', 'En_Revision', 'Aprobada', 'Rechazada', 'En_Ejecucion', 'Cerrada')),
  to_state VARCHAR(20) NOT NULL
    CHECK (to_state IN ('Solicitada', 'En_Revision', 'Aprobada', 'Rechazada', 'En_Ejecucion', 'Cerrada')),
  transitioned_by UUID NOT NULL REFERENCES app_users(id),
  transitioned_by_role VARCHAR(50) NOT NULL,
  justification TEXT NOT NULL CHECK (char_length(justification) >= 10),
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET
);

-- Index on cancellation_id for fetching history by request
CREATE INDEX IF NOT EXISTS idx_cancellation_state_history_cancellation_id ON cancellation_state_history(cancellation_id);

-- Index on transitioned_at for chronological queries
CREATE INDEX IF NOT EXISTS idx_cancellation_state_history_transitioned_at ON cancellation_state_history(transitioned_at);

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS cancellation_state_history CASCADE;
DROP TABLE IF EXISTS cancellation_requests CASCADE;
