# Database Migrations

## Overview

Versioned, reversible database migrations for VantiOps 360 (Neon PostgreSQL).

## Naming Convention

Files are numbered sequentially: `NNN_description.sql`

## Execution Rules

1. Migrations execute in numerical order (001, 002, 003...)
2. Each file contains both `-- UP` and `-- DOWN` sections
3. UP scripts use `CREATE TABLE IF NOT EXISTS` for idempotency
4. DOWN scripts use `DROP TABLE IF EXISTS` for safe rollback
5. **No destructive operations** (DROP, TRUNCATE, DELETE without WHERE) in UP scripts
6. All migrations must be validated in Preview before Production

## Migration Groups

| Range | Group | Description |
|-------|-------|-------------|
| 001-005 | Auth & RBAC | Roles, users, sessions, permissions, role_permissions |
| 006-008 | Partners & Approvals | Partners, partner applications, approval steps |
| 009-013 | Operations | Cancellations, audit, migration batches, documents, businesses |

## How to Apply

```bash
# Apply all UP migrations in order
for f in database/migrations/0*.sql; do
  psql $DATABASE_URL -f "$f" --set ON_ERROR_STOP=on
done

# Rollback a specific migration (extract DOWN section)
# Use the DOWN section of the specific migration file
```

## Rollback

If a migration fails, the system automatically reverts to the previous state.
Each DOWN script reverses its corresponding UP script by dropping tables in 
reverse dependency order.
