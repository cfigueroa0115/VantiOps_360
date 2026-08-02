# Security Policy — VantiOps 360

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via GitHub Security Advisories or contact the repository owner directly. Do not create public issues for security vulnerabilities.

## Credential Management

- **No credentials in code**: All secrets must be loaded from environment variables.
- **No credentials in Git history**: If a secret is accidentally committed, it must be rotated immediately and removed from history using BFG Repo-Cleaner or git filter-repo.
- **Rotation policy**: Rotate all credentials at minimum every 90 days, or immediately upon suspected exposure.

## Known Credential Exposure (RESOLVED)

A Neon PostgreSQL connection string was previously committed in commits `db73678` through `12578f5`. The credential has been removed from code and must be rotated by the database owner.

### Rotation Steps

1. Go to [Neon Console](https://console.neon.tech)
2. Navigate to your project > Connection Details
3. Click "Reset password" to generate a new password
4. Update `DATABASE_URL` in Vercel Project Settings
5. Update your local `.env` file
6. Run `python backend/verify_neon.py` to confirm connectivity
7. Verify production: `curl https://vantiops-360.vercel.app/api/kpis`

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | Vercel + local | Neon PostgreSQL connection string |
| `NEON_DATABASE_URL` | Vercel (backup) | Same connection string (redundancy) |

## Security Controls

- `.env` files are in `.gitignore`
- GitHub Secret Scanning is recommended
- No PII in API responses (min group size ≥ 5)
- No stack traces in production error responses
- CORS restricted to known origins
- SQL queries use parameterized values where possible

## Data Protection

See `DATA_TREATMENT.md` for full data governance policy including:
- Ley 1581 de 2012 (Colombian data protection)
- PII masking strategy
- Access controls per data layer
- Retention policies
