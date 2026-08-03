-- ============================================================
-- Migration 013: Create operational_businesses table
-- Purpose: Track operational businesses for 42-user model
-- Requirements: REQ-21.1, REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS operational_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  nit VARCHAR(20) UNIQUE,
  sector VARCHAR(100),
  contact_email VARCHAR(320),
  assigned_users INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on nit for fast business lookups by tax ID
CREATE INDEX IF NOT EXISTS idx_operational_businesses_nit ON operational_businesses(nit);

-- Index on status for filtering active/inactive businesses
CREATE INDEX IF NOT EXISTS idx_operational_businesses_status ON operational_businesses(status);

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS operational_businesses CASCADE;
