# Implementation Plan: VantiOps 360 Master Spec

## Overview

Implementation plan for VantiOps 360 covering 41 requirements across 4 phases (A: Data/Analytics, B: Security/Governance, C: Operations, D: Quality/Deployment). The approach is incremental: protected components are never modified, only extended. Frontend uses TypeScript (Next.js 14), backend uses Python (FastAPI + Polars + Hypothesis). Each task builds on previous tasks and ends with wired, integrated code.

## Tasks

- [x] 1. Phase A — Foundation: Core interfaces, retry policy, and data dictionary
  - [x] 1.1 Implement centralized retry policy (Python + TypeScript)
    - Create `backend/src/core/retry.py` with `retry_policy` decorator (max 3, backoff 2s, jitter ±500ms, max 30s)
    - Create `frontend/lib/server/retry.ts` with `withRetry` async utility
    - Implement transient vs non-transient error classification
    - _Requirements: 37.1, 37.2, 37.3, 37.5_

  - [x]* 1.2 Write property test for retry policy bounds and classification
    - **Property 7: Retry policy bounds and classification**
    - **Validates: Requirements 37.1, 37.2**
    - Use Hypothesis to verify delay bounds and zero-retry for non-transient errors

  - [x] 1.3 Create data dictionary artifact
    - Create `docs/data-dictionary.md` with all fields from `pqr_records`
    - Document each field: name, type, description, origin, validation rule, example
    - Classify fields as REAL_DATA, DERIVED_DATA, SIMULATED_DATA, or CONCEPTUAL_DESIGN
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 6.1, 6.2_

  - [x] 1.4 Extend Pareto endpoint with high concentration fields
    - Add `high_concentration`, `concentration_pct`, and `analysis_level` fields to `/api/charts/pareto`
    - Implement configurable `PARETO_HIGH_CONCENTRATION_THRESHOLD` via env var (default 0.40)
    - Add error handling with retry policy for DB failures (REQ-05.7)
    - _Requirements: 5.5, 5.6, 5.7_

  - [x]* 1.5 Write property test for Pareto high concentration threshold
    - **Property 1: Pareto high concentration threshold correctness**
    - **Validates: Requirements 5.5**
    - Use Hypothesis to verify threshold logic for varied PQR record sets

  - [x] 1.6 Implement Risk Model API endpoint (replace hardcoded)
    - Create `frontend/app/api/risk/model/route.ts` that reads `data/curated/risk_model_results.json`
    - Return 404 `MODEL_NOT_TRAINED` if file not found
    - Include disclaimer and data provenance `DERIVED_DATA`
    - _Requirements: 7.3, 7.4, 7.5, 3.3_

  - [x]* 1.7 Write property test for risk model metrics validity
    - **Property 14: Risk model metrics validity**
    - **Validates: Requirements 7.2, 7.3, 7.4**
    - Use Hypothesis to verify metrics are in [0,1] and disclaimer is present

  - [x] 1.8 Implement descriptive and inferential statistics enhancements
    - Verify `backend/src/statistics/descriptive.py` computes mean, median, P90, P95, max, stddev for `tiempo_gestion_dias`
    - Verify `backend/src/statistics/inference.py` performs Shapiro-Wilk and 95% CI
    - Enforce MIN_GROUP_SIZE >= 5 exclusion across all stats endpoints
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x]* 1.9 Write property tests for descriptive statistics and MIN_GROUP_SIZE
    - **Property 9: Descriptive statistics correctness**
    - **Property 10: MIN_GROUP_SIZE privacy exclusion**
    - **Validates: Requirements 9.1, 9.3, 38.2**

- [x] 2. Checkpoint — Phase A foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Phase A — ETL Pipeline enhancements
  - [x] 3.1 Enhance ETL pipeline idempotency and control table
    - Implement SHA-256 hash check in `backend/src/pipeline/orchestrator.py`
    - Implement `serving/control_table.json` with batch tracking schema
    - Enforce sequential stages: ingest → profile → validate → enrich → serve
    - On completed hash match, skip reprocessing and return existing result
    - _Requirements: 10.1, 10.2, 10.6, 10.7_

  - [x]* 3.2 Write property test for ETL idempotency
    - **Property 5: ETL pipeline idempotency**
    - **Validates: Requirements 10.1**
    - Use Hypothesis to verify duplicate file processing produces no data changes

  - [x] 3.3 Implement quarantine mechanism for failed validation records
    - Write quarantine logic to `staging/quarantine.parquet` with fields: rule_id, reason, quarantine_timestamp
    - Integrate retry policy for transient I/O errors; validation errors go directly to quarantine
    - Write curated output as `{name}_curated.parquet` with snappy compression
    - _Requirements: 10.3, 10.4, 10.5_

  - [x]* 3.4 Write property test for ETL quarantine completeness
    - **Property 6: ETL quarantine completeness**
    - **Validates: Requirements 10.3**
    - Verify all quarantined records have non-empty rule_id, reason, and valid timestamp

- [x] 4. Phase B — Database schema and migrations
  - [x] 4.1 Create migration infrastructure and initial SQL files
    - Create `database/migrations/` directory with numbered files (001-013)
    - Write `001_create_roles.sql` through `005_create_role_permissions.sql` (auth tables)
    - Write `006_create_partners.sql` through `008_create_approval_steps.sql`
    - Include both UP and DOWN scripts for each migration
    - _Requirements: 12.1, 12.2, 12.3, 11.1, 11.2_

  - [x] 4.2 Create remaining migration files (cancellations, audit, migration tracking)
    - Write `009_create_cancellation_requests.sql` (annulations + state history)
    - Write `010_create_audit_events.sql` (append-only with revoked UPDATE/DELETE)
    - Write `011_create_migration_batches.sql`, `012_create_documents.sql`, `013_create_operational_businesses.sql`
    - Include all indexes as defined in design Section 13
    - _Requirements: 12.1, 14.2, 16.1, 19.1_

  - [x] 4.3 Create ERD documentation artifact
    - Create `docs/erd.md` with Mermaid ERD diagram covering all entities
    - Document relationships with explicit cardinality
    - _Requirements: 11.1, 11.2, 11.3_

  - [x]* 4.4 Write migration integration tests
    - Test UP/DOWN reversibility for each migration file
    - Verify idempotency (CREATE IF NOT EXISTS)
    - Test rollback scenario
    - _Requirements: 12.1, 12.3_

- [x] 5. Phase B — RBAC and Authentication
  - [x] 5.1 Implement RBAC backend module
    - Create `backend/src/auth/rbac.py` with 11 roles from Lista Maestra
    - Define permission matrix (PERMISSIONS const) mapping roles to endpoints
    - Implement role validation logic (max 1 active role per user)
    - _Requirements: 13.1, 13.2, 13.6_

  - [x] 5.2 Implement Next.js RBAC middleware
    - Create `frontend/middleware.ts` with PROTECTED_ROUTES config
    - Extract user role from JWT claim; validate against allowed roles
    - Return 403 for unauthorized access; redirect to `/access-denied` for frontend routes
    - Ensure validation completes within 500ms (no DB query needed — JWT local validation)
    - _Requirements: 13.3, 13.4, 13.5_

  - [x] 5.3 Create Access Denied page and Auth Guard
    - Create `frontend/app/access-denied/page.tsx`
    - Create `frontend/lib/auth/guard.tsx` client-side auth guard component
    - _Requirements: 13.3, 13.6_

  - [x] 5.4 Implement email validation module
    - Create `backend/src/auth/email_validator.py` with domain check (@vanti.com.co + whitelist)
    - Create `frontend/app/api/auth/validate/route.ts` POST endpoint
    - Support whitelist with per-entry expiration dates
    - Handle 2,000 emails without performance degradation
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 22.1_

  - [x]* 5.5 Write property test for RBAC access denial
    - **Property 4: RBAC denies unauthorized access**
    - **Validates: Requirements 13.3, 18.1**
    - Use Hypothesis to generate role/endpoint combinations and verify 403 for unauthorized

  - [x]* 5.6 Write property test for unauthorized email denial
    - **Property 12: Unauthorized email denial with audit**
    - **Validates: Requirements 17.2**
    - Verify non-corporate emails are denied with 403 and audit event created

- [x] 6. Phase B — Audit and Approvals
  - [x] 6.1 Implement audit logging module
    - Create `backend/src/audit/logger.py` with append-only write to `audit_events`
    - Create `frontend/app/api/audit/route.ts` GET endpoint with filtered pagination
    - Support filters: date_start, date_end, user_id, action, resource
    - Ensure síncrono write (audit before response)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x]* 6.2 Write property test for audit log immutability
    - **Property 11: Audit log immutability**
    - **Validates: Requirements 14.2, 14.4**
    - Verify UPDATE/DELETE operations fail on audit_events table

  - [x] 6.3 Implement approvals engine
    - Create `backend/src/governance/approvals.py` with LEGAL_APPROVER and VP_APPROVER workflows
    - Create `frontend/app/api/approvals/route.ts` GET/POST endpoints
    - Implement 72-hour expiration logic with auto-invalidation
    - Define operations requiring approval: migrations to prod, RBAC changes, data deletion, security config
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [x] 7. Checkpoint — Phase B security foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Phase B — Annulations State Machine
  - [x] 8.1 Implement annulations state machine (backend)
    - Create `backend/src/annulations/state_machine.py` with 6 states and valid transitions
    - Enforce terminal states (Cerrada, Rechazada) with no outgoing transitions
    - Validate justification ≥ 10 characters on every transition
    - Validate user role authorization per transition table
    - _Requirements: 16.1, 16.2, 16.3, 16.5, 16.6_

  - [x] 8.2 Implement annulations API endpoints
    - Create `frontend/app/api/annulations/route.ts` (GET list, POST create)
    - Create `frontend/app/api/annulations/[id]/transition/route.ts` (POST transition)
    - Wire state machine validation, RBAC check, and audit logging
    - Return proper error codes: 400 (validation), 403 (permission), 422 (invalid transition)
    - _Requirements: 16.1, 16.2, 16.4, 16.5, 16.6_

  - [x]* 8.3 Write property test for annulation transition validity
    - **Property 2: Annulation state machine transition validity**
    - **Validates: Requirements 16.2, 16.5**
    - Use Hypothesis to test all state/target combinations

  - [x]* 8.4 Write property test for annulation justification and audit
    - **Property 3: Annulation transition requires valid justification and produces audit**
    - **Validates: Requirements 16.3, 16.6**
    - Verify short justifications are rejected and valid ones produce audit entries

  - [x] 8.5 Implement annulations UI components
    - Create `frontend/app/anulaciones/components/` with state visualization
    - Show current state, history, and available transitions
    - Integrate RBAC-based action buttons (only show allowed transitions)
    - _Requirements: 16.4_

  - [x]* 8.6 Write access denied tests for annulations
    - Test INTERN_READONLY cannot approve cancellation → HTTP 403
    - Test state remains unchanged after denied attempt
    - Verify audit_events contains DENY record
    - _Requirements: 18.1, 18.3_

- [x] 9. Phase C — Migration and Operations
  - [x] 9.1 Implement 600-record master migration module
    - Create `backend/src/migration/master_records.py` with full pipeline (profile → clean → validate → load → reconcile → report)
    - Use UPSERT (ON CONFLICT DO NOTHING) for strict idempotency
    - Generate post-migration report JSON
    - Target: ≥ 95% success rate (570/600), ≤ 10 min in CI
    - _Requirements: 19.1, 19.2, 19.5, 19.6, 19.7_

  - [x] 9.2 Implement migration quarantine and retry handling
    - Send failed records to `staging/migration_quarantine.parquet` with record_id, failed_field, rule_violated, rejected_value
    - Apply retry policy for Neon connection failures
    - Abort and preserve existing data if all retries exhausted
    - _Requirements: 19.3, 19.4_

  - [x]* 9.3 Write property test for migration idempotency
    - **Property 8: Migration idempotency**
    - **Validates: Requirements 19.7**
    - Verify re-execution doesn't insert duplicates or modify existing records

  - [x] 9.4 Implement capacity model module
    - Create `backend/src/operations/capacity.py` with formula: netCapacity = hours × productivityFactor
    - Implement utilization calculation and alert levels (green/yellow/orange/red)
    - Create `frontend/app/api/capacity/route.ts` GET endpoint
    - _Requirements: 20.1, 20.2, 20.3_

  - [x]* 9.5 Write property test for capacity model formula
    - **Property 13: Capacity model formula enforcement**
    - **Validates: Requirements 20.1, 20.3**
    - Use Hypothesis to verify formula correctness and alert thresholds

  - [x] 9.6 Implement operational model for 42 users
    - Support simultaneous assignment of 42 active users (12 INTERN + 20 CONTRACTOR + 10 BUSINESS)
    - Implement automatic expiration for INTERN_READONLY and CONTRACTOR_OPERATOR via `expires_at`
    - Register deactivation in audit log on expiration
    - _Requirements: 21.1, 21.2, 21.4_

  - [x] 9.7 Implement email management module
    - Create `backend/src/communications/email_mgr.py` with 2,000 email directory
    - Support bulk operations (activate/deactivate) requiring SYSTEM_ADMIN confirmation
    - Implement throttled sending: max 100 emails/minute
    - Log all communications to audit_events
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

- [x] 10. Checkpoint — Phase C core operations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Phase C — Conceptual designs and documentation
  - [x] 11.1 Create SAP scripting conceptual design document
    - Create `docs/sap-design.md` with 6 automation cases (liquidación, pagos, notas, consultas, reportes, conciliación)
    - Define entry/output/frequency/controls for each case
    - Include security matrix and pseudocode per flow
    - Mark clearly as CONCEPTUAL_DESIGN
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

  - [x] 11.2 Implement Power Automate mock webhook and design document
    - Create `docs/power-automate-design.md` with 8 flow designs
    - Implement `frontend/app/api/webhooks/power-automate/route.ts` mock endpoint
    - Bearer token validation, audit logging of invocations, correlation ID
    - Mark clearly as CONCEPTUAL_DESIGN
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

  - [x] 11.3 Create R analysis conceptual design document
    - Create `docs/r-analysis.md` with 6 use cases (forecast, staffing, SPC, anomalies, backlog, productivity)
    - Define Parquet input / JSON output schemas per case
    - Specify R package dependencies and minimum R version (≥ 4.3.0)
    - Mark clearly as CONCEPTUAL_DESIGN
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6_

  - [x] 11.4 Create onboarding documentation and setup script
    - Create `docs/onboarding.md` covering architecture, setup, conventions, workflow
    - Create setup script that configures dev environment in < 30 minutes
    - Update `README.md` with full project documentation as specified
    - _Requirements: 26.1, 26.2, 26.4_

  - [x] 11.5 Create change management and transition documentation
    - Create `docs/change-management.md` with change process, impact review, RACI
    - Implement Conventional Commits changelog linking
    - Create `docs/transition-plan.md` with contractor responsibilities mapping and 10-day transfer checklist
    - _Requirements: 27.1, 27.2, 27.3, 28.1, 28.2, 28.4_

- [x] 12. Phase D — Quality, Evidence, and Architecture documentation
  - [x] 12.1 Implement evidence generation endpoint and CI artifacts
    - Create `frontend/app/api/evidence/route.ts` GET endpoint returning commit hash, build date, stack versions, test results, coverage
    - Generate evidence artifacts in `frontend/artifacts/` with date/commit structure
    - Wire evidence generation into CI pipeline (final step)
    - _Requirements: 29.1, 29.2, 29.3, 29.4_

  - [x] 12.2 Document architecture as-is and to-be with gap analysis
    - Create `docs/architecture-current.md` with Mermaid component diagram
    - Create `docs/architecture-target.md` with planned improvements marked as CONCEPTUAL_DESIGN
    - Document gaps with priority, effort (days), and dependencies
    - _Requirements: 30.1, 30.2, 30.3, 30.4_

  - [x] 12.3 Create data provenance badge UI component
    - Create `frontend/components/ui/provenance-badge.tsx` with visual indicator (icon/tooltip)
    - Display REAL_DATA, DERIVED_DATA, SIMULATED_DATA, or CONCEPTUAL_DESIGN per data element
    - _Requirements: 6.3_

- [x] 13. Phase D — CI/CD pipeline enhancements and testing
  - [x] 13.1 Extend CI pipeline with Python checks and security scan
    - Add `ruff check backend/` and `pyright backend/` steps before frontend lint
    - Add `pytest backend/tests/` step after frontend unit tests
    - Add SQL validation step for migration files
    - Add security grep step (check for exposed secrets/patterns)
    - Maintain total pipeline ≤ 15 minutes
    - _Requirements: 32.1, 32.2, 31.1, 1.2_

  - [x] 13.2 Implement visual regression baseline and comparison
    - Create screenshot baseline storage in `frontend/artifacts/screenshots/`
    - Add screenshot comparison in CI with 0.1% pixel difference threshold
    - Include all protected routes in baseline
    - _Requirements: 1.1, 1.3_

  - [x] 13.3 Implement Pareto consistency test in CI
    - Create automated test verifying RCA and Dashboard show same top cause and percentage
    - Apply filters and verify consistency is maintained
    - _Requirements: 5.8_

  - [x]* 13.4 Write comprehensive access denied test suite
    - Cover INTERN_READONLY, CONTRACTOR_OPERATOR, AUDITOR against admin endpoints
    - Verify HTTP 403 for denied roles, HTTP 200 for permitted roles
    - At least one endpoint and one role per test category
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [x] 13.5 Implement health check enhancements and degraded mode
    - Extend `GET /api/health` with DB connectivity validation, version, uptime
    - Implement degraded mode: stale cache when latency P95 > 2s or error rate > 1% for 3 min
    - Add 60-second interval health check scheduling
    - _Requirements: 34.2, 39.1, 39.2, 39.3_

  - [x] 13.6 Implement rollback automation and production deploy safety
    - Add post-deploy health check (every 10s for 2 min)
    - If health fails → automatic rollback to previous version within 3 min
    - If rollback fails → critical notification to team
    - Enforce 3 conditions for production: CI green, Preview validated, regression approved
    - _Requirements: 32.5, 32.6, 32.7, 34.5_

- [x] 14. Phase D — Compliance matrix and final wiring
  - [x] 14.1 Generate compliance/traceability matrix
    - Create automated generation of `docs/compliance-matrix.md` linking each requirement to: implementation file, test file, evidence artifact, status
    - Cover all 41 requirements with their acceptance criteria
    - Document limitations with remediation plan where applicable
    - _Requirements: 35.1, 35.2, 35.3, 35.4_

  - [x] 14.2 Wire all components together — integration verification
    - Verify frontend middleware → RBAC → audit → DB flow end-to-end
    - Verify annulations API → state machine → audit → history flow
    - Verify ETL pipeline → control table → Neon → API endpoints flow
    - Verify Pareto as single source: Dashboard and RCA both use `/api/charts/pareto`
    - _Requirements: 5.1, 5.2, 5.3, 13.4, 14.3, 16.4_

  - [x]* 14.3 Write integration tests for end-to-end flows
    - Test full annulation lifecycle (Solicitada → Cerrada)
    - Test RBAC + audit integration (denied access logs audit event)
    - Test ETL pipeline → API serving flow
    - _Requirements: 31.2, 16.1, 14.3_

- [x] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (14 properties total)
- Unit tests validate specific examples and edge cases
- The backend uses Python (FastAPI + Polars + DuckDB + scikit-learn + Hypothesis)
- The frontend uses TypeScript (Next.js 14 + React 18 + Vitest + Playwright)
- Protected components (Section 8 of design) must NOT be modified, only extended
- Conceptual design tasks (SAP, Power Automate, R) produce documentation + mocks, not production integrations
- All migrations use CREATE IF NOT EXISTS for idempotency
- No destructive DB operations (DROP, TRUNCATE, DELETE without WHERE) are permitted

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "4.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.6", "4.2", "4.3"] },
    { "id": 2, "tasks": ["1.5", "1.7", "1.8", "3.1", "4.4"] },
    { "id": 3, "tasks": ["1.9", "3.2", "3.3", "5.1"] },
    { "id": 4, "tasks": ["3.4", "5.2", "5.4", "6.1"] },
    { "id": 5, "tasks": ["5.3", "5.5", "5.6", "6.2", "6.3"] },
    { "id": 6, "tasks": ["8.1", "9.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "8.4", "9.2", "9.4"] },
    { "id": 8, "tasks": ["8.5", "8.6", "9.3", "9.5", "9.6", "9.7"] },
    { "id": 9, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 10, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 11, "tasks": ["13.1", "13.2", "13.3", "13.5"] },
    { "id": 12, "tasks": ["13.4", "13.6", "14.1"] },
    { "id": 13, "tasks": ["14.2"] },
    { "id": 14, "tasks": ["14.3"] }
  ]
}
```
