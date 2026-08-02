# Final Remediation Baseline — VantiOps 360

**Date:** 2026-08-02  
**Commit:** 9fb9599  
**Branch:** feature/vantiops-final-remediation

## Current State (Verified)

### Build
- Frontend build: ✅ PASSES (Next.js 14.2.21)
- Backend tests: 360 pass (last verified session)

### Database (Neon)
- **Tables: 1** (only `pqr_records`)
- Records: 51,008
- Credential: Rotated (npg_1gjE9aMVPBRm)
- No Phase 2 tables exist

### Routes (Production - verified HTTP 200)
All 13 routes return 200: /, /calidad, /riesgo, /rca, /arquitectura, /aliados, /anulaciones, /migracion, /operaciones, /plan-30-60-90, /proveedores, /evidencia, /about

### APIs (Production - verified)
All 11 endpoints return 200 with data: /api/kpis, /api/filters, /api/charts/*, /api/quality, /api/risk, /api/rca

### Critical Issues Found

| ID | Issue | Severity |
|----|-------|----------|
| B-01 | Filters sent from frontend but NOT applied in API queries | CRITICAL |
| B-02 | /api/kpis returns `dataQualityScore: 78.5` hardcoded | HIGH |
| B-03 | /api/quality returns hardcoded dimensions (validity=85, consistency=80, etc.) | HIGH |
| B-04 | /api/risk returns hardcoded static values, no real model artifacts | HIGH |
| B-05 | `/api/charts/quality_by_field` returns 0 data points | HIGH |
| B-06 | `inProcessPqr` = 0 because DB has "en_tramite" not "en_proceso" | MEDIUM |
| B-07 | `qualityIssuesPct` = 100% (incorrect formula) | MEDIUM |
| B-08 | Credential in git history (commits db73678-12578f5) | HIGH |
| B-09 | No Phase 2 tables, no backend logic for partners/cancellations | HIGH |
| B-10 | Pages /aliados, /anulaciones are static React components with no API | HIGH |
| B-11 | /migracion uses setTimeout animation, no real processing | MEDIUM |
| B-12 | No frontend tests exist | MEDIUM |
| B-13 | No CI/CD workflows exist | MEDIUM |
| B-14 | No README.md | LOW |
| B-15 | /riesgo shows contradictory model info (two different algorithms/ROC-AUCs) | HIGH |
| B-16 | RCA page uses invented percentages not matching real data | MEDIUM |
| B-17 | Proveedores page claims "comité evaluador" defined weights - false | LOW |
| B-18 | Evidencia page claims "360 tests, 92.4% coverage" without reports | HIGH |
| B-19 | SECURITY.md says "RESOLVED" but history not cleaned | MEDIUM |
| B-20 | No health/readiness endpoints | LOW |

### Pages Classification

| Page | Type | Backend | Persistence | State Machine | Audit |
|------|------|---------|-------------|---------------|-------|
| / | REAL_DATA (partial) | API queries Neon | N/A | N/A | N/A |
| /calidad | HARDCODED | Partially from API | N/A | N/A | N/A |
| /riesgo | HARDCODED | Static JSON | N/A | N/A | N/A |
| /rca | MIXED | Partial API | N/A | N/A | N/A |
| /arquitectura | STATIC_CONTENT | None | N/A | N/A | N/A |
| /aliados | STATIC_DEMO | None | None | None | None |
| /anulaciones | STATIC_DEMO | None | None | None | None |
| /migracion | ANIMATION | None | None | None | None |
| /operaciones | STATIC_DEMO | None | None | N/A | N/A |
| /plan-30-60-90 | STATIC_CONTENT | None | N/A | N/A | N/A |
| /proveedores | STATIC_DEMO | None | N/A | N/A | N/A |
| /evidencia | FALSE_CLAIMS | None | N/A | N/A | N/A |
| /about | STATIC_CONTENT | None | N/A | N/A | N/A |

### What Must Change (Priority Order)

1. **Etapa 2**: Fix security — clean credential references
2. **Etapa 3**: Make filters actually work in API queries
3. **Etapa 4**: Calculate quality dimensions dynamically
4. **Etapa 5**: Reproduce risk model from real pipeline
5. **Etapa 6**: Fix RCA to use real Pareto data
6. **Etapa 7-11**: Create Phase 2 database tables and backend logic
7. **Etapa 12**: Complete Phase 3 content
8. **Etapa 13-14**: Tests and CI/CD
9. **Etapa 15-16**: Documentation and final validation
