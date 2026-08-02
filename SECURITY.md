# Security Policy — VantiOps 360

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via GitHub Security Advisories or contact the repository owner directly. Do not create public issues for security vulnerabilities.

## Credential Management

- **No credentials in code**: All secrets must be loaded from environment variables.
- **No credentials in Git history**: If a secret is accidentally committed, it must be rotated immediately and removed from history using BFG Repo-Cleaner or git filter-repo.
- **Rotation policy**: Rotate all credentials at minimum every 90 days, or immediately upon suspected exposure.

## Known Credential Exposure

**Status: ROTATED + REMOVED_FROM_CURRENT_CODE + HISTORY_CLEANUP_PENDING**

| Step | Status |
|------|--------|
| Password rotated in Neon | ✅ Done |
| Removed from current source code | ✅ Done |
| DATABASE_URL updated in Vercel | ✅ Done |
| Production verified working | ✅ Done |
| Git history cleaned (BFG/filter-repo) | ⚠️ PENDING |
| Previous credential revoked | ✅ Done (rotated = old invalid) |

**Note:** The git history still contains old credentials in commits `db73678`–`12578f5`. Since the password has been rotated, the exposed value is no longer valid. Full history cleanup requires running BFG Repo-Cleaner or git filter-repo, which will invalidate all existing clones.

### History Cleanup Procedure (for repository owner)

```bash
# 1. Ensure old credential is already rotated (confirmed)
# 2. Clone a fresh copy
git clone --mirror https://github.com/cfigueroa0115/VantiOps_360.git

# 3. Run BFG to remove the pattern
java -jar bfg.jar --replace-text patterns.txt VantiOps_360.git
# patterns.txt should contain the old password pattern

# 4. Clean and push
cd VantiOps_360.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force

# 5. All collaborators must re-clone
```

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
