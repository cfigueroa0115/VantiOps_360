"""Seed partner data for POC demonstration."""
import os
import sys
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL required")
    sys.exit(1)

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = True
cur = conn.cursor()

# Check if already seeded
cur.execute("SELECT COUNT(*) FROM partners")
count = cur.fetchone()[0]
if count > 0:
    print(f"Partners already seeded ({count} records). Skipping.")
    conn.close()
    sys.exit(0)

PARTNERS = [
    ("TechServ Colombia SAS", "900.123.456-7", "operaciones@techserv.co"),
    ("DataFlow Analytics", "901.234.567-8", "admin@dataflow.com.co"),
    ("CloudOps Infrastructure", "902.345.678-9", "legal@cloudops.co"),
    ("Seguridad Integral LTDA", "800.456.789-0", "contrato@seguridad-integral.co"),
    ("TransLog Express", "903.567.890-1", "gerencia@translog.co"),
    ("GreenEnergy Soluciones", "904.678.901-2", "alianzas@greenenergy.co"),
]

for name, tax_id, email in PARTNERS:
    cur.execute(
        "INSERT INTO partners (name, tax_id, contact_email, status) VALUES (%s, %s, %s, 'active') RETURNING id",
        (name, tax_id, email)
    )
    partner_id = cur.fetchone()[0]
    cur.execute(
        "INSERT INTO partner_authorized_emails (partner_id, email, is_active) VALUES (%s, %s, true)",
        (partner_id, email)
    )
    print(f"  ✓ {name} ({email})")

conn.close()
print(f"\n✅ {len(PARTNERS)} partners seeded with authorized emails")
