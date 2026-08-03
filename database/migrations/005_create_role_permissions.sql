-- ============================================================
-- Migration 005: Create user_roles and role_permissions tables
-- Purpose: Link users to roles and roles to permissions (RBAC matrix)
-- Requirements: REQ-13.1, REQ-13.2, REQ-12.1, REQ-11.1
-- ============================================================

-- UP
-- ============================================================

-- User-to-Role assignment (max 1 active role per user)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES app_users(id),
  PRIMARY KEY (user_id, role_id)
);

-- Enforce max 1 active role per user via unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_active_role ON user_roles(user_id);

-- Index on role_id for reverse lookups (all users with a role)
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- Role-to-Permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Index on permission_id for reverse lookups
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- Seed role-permission assignments for the 11 roles
-- SYSTEM_ADMIN gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'SYSTEM_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- OPERATIONS_LEAD: read + analysis + reports + capacity + alerts
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'OPERATIONS_LEAD'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'READ_RISK', 'READ_STATISTICS',
    'READ_REPORTS', 'EXPORT_DATA', 'READ_ANNULATIONS',
    'READ_CAPACITY', 'MANAGE_CAPACITY', 'READ_EVIDENCE'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ANALYST: read + analysis + reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'ANALYST'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'READ_RISK', 'READ_STATISTICS',
    'READ_REPORTS', 'EXPORT_DATA', 'READ_ANNULATIONS'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- LEGAL_APPROVER: read + legal approvals
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'LEGAL_APPROVER'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'READ_ANNULATIONS',
    'APPROVE_LEGAL', 'APPROVE_ANNULATION', 'READ_AUDIT'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- VP_APPROVER: read + VP approvals
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'VP_APPROVER'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'READ_ANNULATIONS',
    'APPROVE_VP', 'APPROVE_ANNULATION', 'READ_AUDIT'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- BUSINESS_OWNER: read + reports + operational approvals
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'BUSINESS_OWNER'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'READ_REPORTS', 'EXPORT_DATA',
    'READ_ANNULATIONS', 'CREATE_ANNULATION', 'READ_CAPACITY'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- AUDITOR: read + audit logs
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'AUDITOR'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'READ_AUDIT', 'READ_EVIDENCE',
    'READ_ANNULATIONS'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- PARTNER_ADMIN: manage own org + read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'PARTNER_ADMIN'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'MANAGE_OWN_PARTNER'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- PARTNER_OPERATOR: read + delegated operations
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'PARTNER_OPERATOR'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'READ_ANNULATIONS'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- CONTRACTOR_OPERATOR: read + analysis
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'CONTRACTOR_OPERATOR'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'READ_STATISTICS'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- INTERN_READONLY: read + data ingestion
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'INTERN_READONLY'
  AND p.code IN (
    'READ_DASHBOARD', 'READ_CHARTS', 'READ_KPIS', 'READ_FILTERS',
    'READ_RCA', 'READ_QUALITY', 'INGEST_DATA'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
