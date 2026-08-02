# Current State Audit — VantiOps 360

**Date:** 2026-08-02  
**Branch:** feature/vantiops-360-completion  
**Last stable commit:** 12578f5

## Structure

```
VantiOps_360/
├── frontend/          Next.js 14 + TypeScript + Tailwind
├── backend/           Python 3.11 (Polars, DuckDB, FastAPI, scikit-learn)
├── data/              Pipeline layers (raw, staging, validated, curated, serving)
├── .kiro/specs/       Spec documents (pqr-analytics only)
├── DATA_TREATMENT.md  Data governance
├── vercel.json        Deployment config
└── .gitignore
```

## Technologies

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 14.2, React 18, TypeScript 5.7, Tailwind CSS 3.4, Recharts, shadcn/ui, @radix-ui |
| Backend | Python 3.11, Polars, DuckDB, FastAPI, scikit-learn, Pandera, scipy |
| Database | Neon PostgreSQL (serverless) |
| Deployment | Vercel (edge functions) |
| Data Pipeline | Parquet (snappy), DuckDB aggregations |

## Routes — Existing vs Missing

| Route | Status | Notes |
|-------|--------|-------|
| `/` | ✅ EXISTS | Dashboard page with placeholders in chart sections |
| `/api/kpis` | ✅ FUNCTIONAL | Returns real data from Neon |
| `/api/filters` | ✅ FUNCTIONAL | Returns real filter options |
| `/api/charts/[type]` | ✅ FUNCTIONAL | 10 chart types working |
| `/api/quality` | ✅ FUNCTIONAL | Partially hardcoded dimensions |
| `/api/risk` | ⚠️ STATIC | Hardcoded values, no real model execution |
| `/api/rca` | ✅ FUNCTIONAL | Real main cause from DB |
| `/calidad` | ❌ MISSING | 404 |
| `/riesgo` | ❌ MISSING | 404 |
| `/rca` | ❌ MISSING | 404 |
| `/arquitectura` | ❌ MISSING | 404 |
| `/aliados` | ❌ MISSING | 404 |
| `/anulaciones` | ❌ MISSING | 404 |
| `/migracion` | ❌ MISSING | 404 |
| `/operaciones` | ❌ MISSING | 404 |
| `/plan-30-60-90` | ❌ MISSING | 404 |
| `/proveedores` | ❌ MISSING | 404 |
| `/evidencia` | ❌ MISSING | 404 |
| `/about` | ❌ MISSING | 404 |

## Components with Placeholders

File: `frontend/app/page.tsx` contains:
- "Gráfico de tendencia (X registros)" — placeholder text instead of chart component
- "Gráfico de causas (X registros)" — placeholder text
- "Gráfico de canales (X registros)" — placeholder text

## Filters Not Applied

The frontend sends filter params but:
- API `/api/kpis` does NOT currently accept filter query params (tagged template, no WHERE clause injection point)
- Charts do not pass filter state to API calls in the page component

## Hardcoded Metrics

| Endpoint | Hardcoded Value |
|----------|-----------------|
| `/api/kpis` | `dataQualityScore: 78.5` |
| `/api/quality` | `validity: 85, consistency: 80, uniqueness: 98, timeliness: 90, referentialIntegrity: 85` |
| `/api/risk` | ALL values (precision, recall, F1, ROC-AUC, feature importance) |

## Secrets Detected

| File | Line | Content |
|------|------|---------|
| `backend/seed_neon.py` | 23 | Full Neon connection string with password |
| `backend/verify_neon.py` | 4 | Full Neon connection string with password |
| Git history | commits db73678–12578f5 | Connection string exposed |

## Tests

| Suite | Count | Status |
|-------|-------|--------|
| Backend (pytest) | 360 | ✅ All pass |
| Frontend unit | 0 | ❌ None exist |
| E2E | 0 | ❌ None exist |
| Security scan | 0 | ❌ None exist |

## Documentation Missing

- [ ] README.md (proper)
- [ ] CONTRIBUTING.md
- [ ] Architecture diagrams
- [ ] API documentation
- [ ] Executive summary
- [ ] Presentation outline
- [ ] Traceability matrix
- [ ] CI/CD workflows

## Phase Status

| Phase | Status | Completeness |
|-------|--------|-------------|
| Phase 1 (Analytics) | ⚠️ Partial | Backend 95%, Frontend 60% (placeholders, static values) |
| Phase 2 (Partners) | ❌ Not started | 0% |
| Phase 3 (Operations) | ❌ Not started | 0% |

## Risks

1. **CRITICAL**: Neon credential exposed in code and git history
2. **HIGH**: Dashboard shows placeholders instead of real charts
3. **HIGH**: Filters not applied to data queries
4. **HIGH**: Quality/Risk endpoints return hardcoded data
5. **MEDIUM**: No frontend tests
6. **MEDIUM**: No CI/CD pipeline
7. **MEDIUM**: No navigation beyond `/`
8. **LOW**: No README
9. **LOW**: No 404 page

## Remediation Plan

See `docs/audit/remediation-matrix.md`
