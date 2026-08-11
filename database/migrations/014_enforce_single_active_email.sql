-- ============================================================
-- Migration 014: Enforce single active authorized email per partner
-- Purpose: Guarantee that each partner has at most ONE active email
-- Requirements: REQ-12.1 (un único correo activo por aliado)
-- ============================================================

-- UP
-- ============================================================

-- Partial unique index: only one row with is_active=true per partner_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_single_active_email
  ON partner_authorized_emails(partner_id)
  WHERE is_active = true;

-- DOWN
-- ============================================================

DROP INDEX IF EXISTS idx_partner_single_active_email;
