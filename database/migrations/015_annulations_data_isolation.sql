-- ============================================================
-- Migration 015: Add data isolation and concurrency fields to cancellation_requests
-- Purpose: Structured demo data isolation, partner tracking, optimistic concurrency
-- Requirements: Assessment Demo data safety, audit traceability
-- ============================================================

-- UP
-- ============================================================

-- Data classification for structured isolation (REAL_DATA vs SIMULATED_DATA)
ALTER TABLE cancellation_requests
  ADD COLUMN IF NOT EXISTS data_classification VARCHAR(30) NOT NULL DEFAULT 'REAL_DATA'
    CHECK (data_classification IN ('REAL_DATA', 'SIMULATED_DATA'));

-- Demo batch identifier for targeted reset operations
ALTER TABLE cancellation_requests
  ADD COLUMN IF NOT EXISTS demo_batch_id VARCHAR(100) NULL;

-- Optimistic concurrency control
ALTER TABLE cancellation_requests
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Partner reference for ownership validation
ALTER TABLE cancellation_requests
  ADD COLUMN IF NOT EXISTS partner_id UUID NULL;

-- Sender email at creation time (historical evidence)
ALTER TABLE cancellation_requests
  ADD COLUMN IF NOT EXISTS sender_email VARCHAR(320) NULL;

-- Index for efficient reset queries
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_demo_isolation
  ON cancellation_requests(data_classification, demo_batch_id)
  WHERE data_classification = 'SIMULATED_DATA';

-- DOWN
-- ============================================================

DROP INDEX IF EXISTS idx_cancellation_requests_demo_isolation;
ALTER TABLE cancellation_requests DROP COLUMN IF EXISTS sender_email;
ALTER TABLE cancellation_requests DROP COLUMN IF EXISTS partner_id;
ALTER TABLE cancellation_requests DROP COLUMN IF EXISTS version;
ALTER TABLE cancellation_requests DROP COLUMN IF EXISTS demo_batch_id;
ALTER TABLE cancellation_requests DROP COLUMN IF EXISTS data_classification;
