-- ============================================================
-- Migration 001: Create roles table
-- Purpose: Define the 11 RBAC roles from Lista Maestra
-- Requirements: REQ-13.1, REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the 11 roles from Lista Maestra
INSERT INTO roles (name, description) VALUES
  ('SYSTEM_ADMIN', 'Administrador del sistema técnico — Acceso total a configuración, gestión de usuarios, todos los módulos'),
  ('OPERATIONS_LEAD', 'Líder de operaciones / Supervisor — Lectura + análisis + reportes + gestión de capacidad + alertas'),
  ('ANALYST', 'Analista de operaciones PQR — Lectura + análisis + reportes'),
  ('LEGAL_APPROVER', 'Aprobador legal corporativo — Lectura + aprobación de operaciones legales'),
  ('VP_APPROVER', 'Aprobador VP corporativo — Lectura + aprobación de operaciones de VP'),
  ('BUSINESS_OWNER', 'Empleado de negocio — Lectura + reportes + aprobaciones operativas'),
  ('AUDITOR', 'Auditor interno/externo — Lectura + consulta de logs de auditoría'),
  ('PARTNER_ADMIN', 'Administrador de socio/partner — Gestión de usuarios de su organización + lectura'),
  ('PARTNER_OPERATOR', 'Operador de socio/partner — Lectura + operaciones delegadas'),
  ('CONTRACTOR_OPERATOR', 'Contratista — Lectura + análisis'),
  ('INTERN_READONLY', 'Pasante — Lectura + ingesta de datos')
ON CONFLICT (name) DO NOTHING;

-- Index on role name for fast lookups
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS roles CASCADE;
