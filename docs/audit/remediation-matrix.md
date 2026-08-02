# Remediation Matrix — VantiOps 360

| # | Finding | Severity | File(s) | Action | Test | Status |
|---|---------|----------|---------|--------|------|--------|
| 1 | Neon credential in code | CRITICAL | seed_neon.py, verify_neon.py | Replace with os.getenv() | grep for npg_ | ✅ FIXED |
| 2 | Credential in git history | CRITICAL | commits db73678–12578f5 | Rotate credential + document | SECURITY.md | ⚠️ ROTATION PENDING |
| 3 | No .env.example | HIGH | root | Create .env.example | file exists | ✅ FIXED |
| 4 | No SECURITY.md | HIGH | root | Create security policy | file exists | ✅ FIXED |
| 5 | Dashboard placeholders | HIGH | app/page.tsx | Connect real chart components | visual inspection | PENDING |
| 6 | Filters not applied | HIGH | api/kpis/route.ts | Add WHERE clause from params | filter test | PENDING |
| 7 | dataQualityScore hardcoded | MEDIUM | api/kpis/route.ts | Calculate from DB | value changes with filters | PENDING |
| 8 | Quality dimensions hardcoded | MEDIUM | api/quality/route.ts | Calculate dynamically | endpoint returns real values | PENDING |
| 9 | Risk model static | MEDIUM | api/risk/route.ts | Serve from pre-computed JSON or calculate | non-zero real values | PENDING |
| 10 | No /calidad route | MEDIUM | frontend/app/ | Create page | no 404 | PENDING |
| 11 | No /riesgo route | MEDIUM | frontend/app/ | Create page | no 404 | PENDING |
| 12 | No /rca route | MEDIUM | frontend/app/ | Create page | no 404 | PENDING |
| 13 | No frontend tests | MEDIUM | frontend/tests/ | Add Vitest + Playwright | tests pass | PENDING |
| 14 | No CI/CD | MEDIUM | .github/workflows/ | Create pipelines | workflows execute | PENDING |
| 15 | No README | LOW | root | Create comprehensive README | file exists | PENDING |
| 16 | Phase 2 missing | HIGH | — | Implement partners module | routes work | PENDING |
| 17 | Phase 3 missing | HIGH | — | Implement operations module | routes work | PENDING |
| 18 | No 404 page | LOW | frontend/app/ | Create not-found.tsx | 404 renders | PENDING |
| 19 | SQL injection in filters | MEDIUM | api/kpis/route.ts | Use parameterized queries | security test | PENDING |
| 20 | No health endpoint | LOW | frontend/app/api/ | Create /api/health | returns 200 | PENDING |
