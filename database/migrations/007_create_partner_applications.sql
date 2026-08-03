-- ============================================================
-- Migration 007: Create partner_applications and partner_application_versions tables
-- Purpose: Track partner applications with version history
-- Requirements: REQ-15.1, REQ-12.1, REQ-11.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  application_type VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on partner_id for fetching applications by partner
CREATE INDEX IF NOT EXISTS idx_partner_applications_partner_id ON partner_applications(partner_id);

-- Index on status for filtering by application status
CREATE INDEX IF NOT EXISTS idx_partner_applications_status ON partner_applications(status);

-- Application versions (content snapshots)
CREATE TABLE IF NOT EXISTS partner_application_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id),
  UNIQUE (application_id, version_number)
);

-- Index on application_id for version history lookups
CREATE INDEX IF NOT EXISTS idx_partner_app_versions_app_id ON partner_application_versions(application_id);

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS partner_application_versions CASCADE;
DROP TABLE IF EXISTS partner_applications CASCADE;
