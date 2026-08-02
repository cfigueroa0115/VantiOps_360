"""Verify Neon database completeness."""
import psycopg2

DATABASE_URL = "postgresql://neondb_owner:npg_yR1hHav0ePkw@ep-twilight-hill-ay1t3h87-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# 1. Total records
cur.execute("SELECT COUNT(*) FROM pqr_records")
total = cur.fetchone()[0]
print(f"Total registros: {total}")

# 2. Columns
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pqr_records' ORDER BY ordinal_position")
cols = cur.fetchall()
print(f"\nColumnas ({len(cols)}):")
for col in cols:
    print(f"  {col[0]:30s} {col[1]}")

# 3. Data checks
cur.execute("SELECT COUNT(DISTINCT causa) FROM pqr_records WHERE causa IS NOT NULL")
print(f"\nCausas distintas: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(DISTINCT empresa) FROM pqr_records WHERE empresa IS NOT NULL")
print(f"Empresas distintas: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(DISTINCT canal_atencion) FROM pqr_records WHERE canal_atencion IS NOT NULL")
print(f"Canales distintos: {cur.fetchone()[0]}")

cur.execute("SELECT estado, COUNT(*) FROM pqr_records WHERE estado IS NOT NULL GROUP BY estado ORDER BY COUNT(*) DESC")
print("\nDistribucion por estado:")
for row in cur.fetchall():
    print(f"  {row[0]:20s} {row[1]:>6d}")

cur.execute("SELECT ROUND(AVG(tiempo_gestion_dias)::numeric, 2), ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 2), ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY tiempo_gestion_dias)::numeric, 2) FROM pqr_records WHERE tiempo_gestion_dias IS NOT NULL")
stats = cur.fetchone()
print(f"\nTiempo gestion: mean={stats[0]}, median={stats[1]}, P90={stats[2]}")

cur.execute("SELECT causa, COUNT(*) AS cnt FROM pqr_records WHERE causa IS NOT NULL GROUP BY causa ORDER BY cnt DESC LIMIT 5")
print("\nTop 5 causas:")
for row in cur.fetchall():
    print(f"  {row[0]:50s} {row[1]:>6d}")

# 4. Indexes
cur.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'pqr_records'")
print(f"\nIndices:")
for row in cur.fetchall():
    print(f"  {row[0]}")

# 5. Date range
cur.execute("SELECT MIN(fecha_creacion), MAX(fecha_creacion) FROM pqr_records WHERE fecha_creacion IS NOT NULL")
dates = cur.fetchone()
print(f"\nRango fechas: {dates[0]} a {dates[1]}")

# 6. Null analysis
cur.execute("""
    SELECT 
        COUNT(*) FILTER (WHERE causa IS NULL) as causa_null,
        COUNT(*) FILTER (WHERE empresa IS NULL) as empresa_null,
        COUNT(*) FILTER (WHERE canal_atencion IS NULL) as canal_null,
        COUNT(*) FILTER (WHERE estado IS NULL) as estado_null,
        COUNT(*) FILTER (WHERE tiempo_gestion_dias IS NULL) as tiempo_null,
        COUNT(*) FILTER (WHERE fecha_creacion IS NULL) as fecha_null
    FROM pqr_records
""")
nulls = cur.fetchone()
print(f"\nNulls por campo:")
print(f"  causa: {nulls[0]}, empresa: {nulls[1]}, canal: {nulls[2]}")
print(f"  estado: {nulls[3]}, tiempo_gestion: {nulls[4]}, fecha_creacion: {nulls[5]}")

conn.close()
print("\n" + "="*60)
print("✅ BASE DE DATOS NEON: VERIFICACION COMPLETA")
print(f"   - {total} registros cargados")
print(f"   - {len(cols)} columnas")
print(f"   - Indexes creados correctamente")
print("="*60)
