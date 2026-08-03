-- ============================================================
-- Migration 011: Create migration_batches and migration_records tables
-- Purpose: Track 600-record master migration progress
-- Requirements: REQ-19.1, REQ-12.1
-- ============================================================

-- UP
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash for idempotency
  file_name VARCHAR(500),
  total_records INT NOT NULL DEFAULT 0,
  records_ingested INT NOT NULL DEFAULT 0,
  records_validated INT NOT NULL DEFAULT 0,
  records_quarantined INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  processing_duration_seconds FLOAT,
  errors JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index on source_file_hash for idempotency checks
CREATE INDEX IF NOT EXISTS idx_migration_batches_file_hash ON migration_batches(source_file_hash);

-- Index on status for filtering active/completed batches
CREATE INDEX IF NOT EXISTS idx_migration_batches_status ON migration_batches(status);

-- Migration records tracking individual record outcomes
CREATE TABLE IF NOT EXISTS migration_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES migration_batches(id) ON DELETE CASCADE,
  source_record_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('migrated', 'quarantined', 'rejected')),
  error_details JSONB,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, source_record_id)
);

-- Index on batch_id for batch-level queries
CREATE INDEX IF NOT EXISTS idx_migration_records_batch_id ON migration_records(batch_id);

-- Index on status for filtering by outcome
CREATE INDEX IF NOT EXISTS idx_migration_records_status ON migration_records(status);

-- DOWN
-- ============================================================

DROP TABLE IF EXISTS migration_records CASCADE;
DROP TABLE IF EXISTS migration_batches CASCADE;
