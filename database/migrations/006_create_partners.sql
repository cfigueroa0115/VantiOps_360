-- ============================================================
-- Migration 006: Create partners and partner_authorized_emails tables
-- Purpose: Manage partner organizations and their authorized email domains
-- Requirements: REQ-17.3, REQ-12.1, REQ-11.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  tax_id VARCHAR(20) UNIQUE,
  contact_email VARCHAR(320),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on status for filtering active partners
CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);

-- Index on tax_id for lookups
CREATE INDEX IF NOT EXISTS idx_partners_tax_id ON partners(tax_id);

-- Partner authorized emails (whitelist with per-entry expiration)
CREATE TABLE IF NOT EXISTS partner_authorized_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  domain VARCHAR(200),
  expires_at TIMESTAMPTZ,  -- NULL = no expiration
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_id, email)
);

-- Index on email for fast authentication checks
CREATE INDEX IF NOT EXISTS idx_partner_emails_email ON partner_authorized_emails(email);

-- Index on domain for domain-based lookups
CREATE INDEX IF NOT EXISTS idx_partner_emails_domain ON partner_authorized_emails(domain)
  WHERE domain IS NOT NULL;

-- Index for active/non-expired email checks
CREATE INDEX IF NOT EXISTS idx_partner_emails_active ON partner_authorized_emails(is_active, expires_at)
  WHERE is_active = true;

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS partner_authorized_emails CASCADE;
DROP TABLE IF EXISTS partners CASCADE;
