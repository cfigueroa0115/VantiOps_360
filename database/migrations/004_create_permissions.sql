-- ============================================================
-- Migration 004: Create permissions table
-- Purpose: Define granular permissions for RBAC matrix
-- Requirements: REQ-13.1, REQ-13.2, REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  resource VARCHAR(200) NOT NULL,
  action VARCHAR(50) NOT NULL  -- 'read', 'write', 'approve', 'admin'
);

-- Seed core permissions
INSERT INTO permissions (code, description, resource, action) VALUES
  -- Dashboard & Read
  ('READ_DASHBOARD', 'View main dashboard with KPIs and charts', '/dashboard', 'read'),
  ('READ_CHARTS', 'View all chart types', '/api/charts/*', 'read'),
  ('READ_KPIS', 'View KPI metrics', '/api/kpis', 'read'),
  ('READ_FILTERS', 'Access filter values', '/api/filters', 'read'),
  ('READ_RCA', 'View root cause analysis', '/api/rca', 'read'),
  ('READ_QUALITY', 'View data quality scores', '/api/quality', 'read'),
  ('READ_RISK', 'View risk model results', '/api/risk/model', 'read'),
  
  -- Analysis & Reports
  ('READ_STATISTICS', 'View descriptive and inferential statistics', '/api/statistics', 'read'),
  ('READ_REPORTS', 'Access generated reports', '/reports', 'read'),
  ('EXPORT_DATA', 'Export data to external formats', '/export', 'read'),
  
  -- Ingestion
  ('INGEST_DATA', 'Upload and ingest PQR files', '/api/ingest', 'write'),
  
  -- Annulations
  ('READ_ANNULATIONS', 'View cancellation requests', '/api/annulations', 'read'),
  ('CREATE_ANNULATION', 'Create a cancellation request', '/api/annulations', 'write'),
  ('TRANSITION_ANNULATION', 'Transition cancellation state', '/api/annulations/*/transition', 'write'),
  ('APPROVE_ANNULATION', 'Approve cancellation requests', '/api/annulations/*/approve', 'approve'),
  
  -- Audit
  ('READ_AUDIT', 'View audit logs', '/api/audit', 'read'),
  
  -- Approvals
  ('APPROVE_LEGAL', 'Legal approval authority', '/api/approvals/legal', 'approve'),
  ('APPROVE_VP', 'VP approval authority', '/api/approvals/vp', 'approve'),
  
  -- User Management
  ('MANAGE_USERS', 'Create, update, deactivate users', '/admin/users', 'admin'),
  ('MANAGE_ROLES', 'Assign and revoke roles', '/admin/roles', 'admin'),
  
  -- Partner Management
  ('MANAGE_PARTNERS', 'Manage partner organizations', '/admin/partners', 'admin'),
  ('MANAGE_OWN_PARTNER', 'Manage own partner organization users', '/partners/own', 'write'),
  
  -- System Administration
  ('ADMIN_SYSTEM', 'Full system administration', '/admin/*', 'admin'),
  ('MANAGE_CONFIG', 'Manage system configuration', '/admin/config', 'admin'),
  
  -- Capacity
  ('READ_CAPACITY', 'View capacity model', '/api/capacity', 'read'),
  ('MANAGE_CAPACITY', 'Manage capacity assignments', '/api/capacity', 'write'),
  
  -- Evidence
  ('READ_EVIDENCE', 'View build evidence and artifacts', '/api/evidence', 'read')
ON CONFLICT (code) DO NOTHING;

-- Index on resource for permission checks
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);

-- Index on action for filtering by operation type
CREATE INDEX IF NOT EXISTS idx_permissions_action ON permissions(action);

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS permissions CASCADE;
