-- ============================================================
-- Migration 012: Create documents and document_versions tables
-- Purpose: Document management with version control
-- Requirements: REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL,
  size_bytes BIGINT,
  storage_path VARCHAR(500),
  title VARCHAR(500),
  document_type VARCHAR(50),
  owner_id UUID REFERENCES app_users(id),
  uploaded_by UUID REFERENCES app_users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on uploaded_by for user-based document lookups
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);

-- Index on type for filtering by document type
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);

-- Index on owner_id for owner-based queries
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);

-- Index on status for filtering by document status
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- Document versions for version control
CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  content JSONB,
  file_path VARCHAR(500),
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

-- Index on document_id for version lookups
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS document_versions CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
