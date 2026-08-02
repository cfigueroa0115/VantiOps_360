"""Verify Neon database completeness.

Usage:
    export DATABASE_URL="postgresql://..."
    python verify_neon.py
"""
import os
import sys

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is required.")
    sys.exit(1)

import psycopg2

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM pqr_records")
total = cur.fetchone()[0]
print(f"Total registros: {total}")

cur.execute(
    "SELECT column_name, data_type FROM information_schema.columns "
    "WHERE table_name = 'pqr_records' ORDER BY ordinal_position"
)
cols = cur.fetchall()
print(f"\nColumnas ({len(cols)}):")
for col in cols:
    print(f"  {col[0]:30s} {col[1]}")

cur.execute("SELECT COUNT(DISTINCT causa) FROM pqr_records WHERE causa IS NOT NULL")
print(f"\nCausas distintas: {cur.fetchone()[0]}")

cur.execute("SELECT estado, COUNT(*) FROM pqr_records WHERE estado IS NOT NULL GROUP BY estado ORDER BY COUNT(*) DESC")
print("\nDistribucion por estado:")
for row in cur.fetchall():
    print(f"  {row[0]:20s} {row[1]:>6d}")

cur.execute(
    "SELECT ROUND(AVG(tiempo_gestion_dias)::numeric, 2), "
    "ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 2), "
    "ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 2) "
    "FROM pqr_records WHERE tiempo_gestion_dias IS NOT NULL"
)
stats = cur.fetchone()
print(f"\nTiempo gestion: mean={stats[0]}, median={stats[1]}, P90={stats[2]}")

cur.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'pqr_records'")
print(f"\nIndices:")
for row in cur.fetchall():
    print(f"  {row[0]}")

conn.close()
print(f"\n{'='*60}")
print(f"✅ BASE DE DATOS NEON VERIFICADA: {total} registros")
print(f"{'='*60}")
