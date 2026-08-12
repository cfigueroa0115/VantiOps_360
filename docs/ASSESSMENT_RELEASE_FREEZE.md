# VantiOps 360 — Assessment Release Freeze

## Release Information

| Attribute | Value |
|-----------|-------|
| Final Release Tag | `v1.0.2-assessment-final` |
| Release Status | FROZEN AFTER PRODUCTION CERTIFICATION |
| Production URL | https://vantiops-360.vercel.app |
| Previous Release | `v1.0.1-assessment` (preserved, untouched) |

## Certification

Certification is resolved by the final tag and CI/Production evidence associated with the tagged commit. The tag `v1.0.2-assessment-final` is only created after all production gates pass successfully.

## Data Provenance

### REAL_DATA

- Dataset Entrada_PQRs supplied for the technical assessment
- 51,008 PQR records loaded into Neon PostgreSQL
- No real-time integration with Vanti internal production systems

### DERIVED_DATA

- KPIs computed from PQR dataset
- Pareto analysis and concentration detection
- Descriptive and inferential statistics
- Root cause analysis indicators
- Data quality scoring
- Risk model outputs (logistic regression classification)

### SIMULATED_DATA

- Fase 02/03 demonstration information where real operational datasets were not provided
- Migration scenario (600-record Maestro Vanti conceptual exercise)
- Operational capacity planning scenarios
- Vendor/partner example data

### CONCEPTUAL_DESIGN

- AWS target architecture (documented, not deployed)
- SAP productive integration (designed, not connected)
- Power Automate productive integration (designed, not connected)
- R productive integration (designed, not connected)
- Corporate email/provider integrations (designed, not connected)
- Internal Vanti system integrations (designed, not connected)

## Security Controls

- JWT server-side authentication and authorization
- Fail-closed access control (no access without valid token)
- Spoofed roles rejected (x-user-role header without JWT = denied)
- Single active partner email validation control
- Append-only audit logging where applicable
- Seed production guard (refuses DROP TABLE in production environments)
- No secrets in evidence artifacts
- No PII in generated reports

## Known Technical Debt

- 0 critical production dependency vulnerabilities
- 2 HIGH production dependency advisories (documented, pre-existing)
- Future framework upgrade required (Next.js major version)
- No forced major upgrade during assessment closure

## Risk Model Data Truth

The system guarantees artifact/API/UI consistency through:

1. Pipeline produces `data/curated/risk_model_results.json`
2. Loader (`risk-model-loader.ts`) validates strictly — no fallbacks
3. API (`/api/risk/model`) publishes only validated artifacts (503 if invalid)
4. UI (`/riesgo`) consumes exclusively that API
5. CI compares artifact/API/UI (Risk Data Truth Gate)
6. Production Smoke re-compares API/UI in production
7. If divergence exists, release fails

## Freeze Rules

After `v1.0.2-assessment-final` is tagged:

- NO additional commits for the assessment
- NO documentation updates
- NO dependency changes
- NO visual baseline updates
- NO cosmetic improvements
- NO new PRs for the assessment scope

All subsequent development, if any, constitutes post-assessment work under a separate release cycle.
