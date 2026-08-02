"""Seed Neon PostgreSQL database with PQR data from the curated Parquet file.

Creates the pqr_records table and loads all records from the curated Parquet.

Usage:
    cd backend
    pip install psycopg2-binary polars
    python seed_neon.py

Environment:
    DATABASE_URL — Neon PostgreSQL connection string
"""

import os
import sys
from pathlib import Path

import polars as pl

# Connection string
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_yR1hHav0ePkw@ep-twilight-hill-ay1t3h87-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"
)

# Path to curated Parquet
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CURATED_FILE = PROJECT_ROOT / "data" / "curated" / "pqr_curated.parquet"


def create_table(conn):
    """Create the pqr_records table if it does not exist."""
    cur = conn.cursor()
    cur.execute("""
        DROP TABLE IF EXISTS pqr_records;
        CREATE TABLE pqr_records (
            id SERIAL PRIMARY KEY,
            id_pqr INTEGER,
            fecha_creacion DATE,
            fecha_cierre DATE,
            estado VARCHAR(50),
            causa TEXT,
            canal_atencion VARCHAR(100),
            empresa VARCHAR(200),
            resultado VARCHAR(100),
            unidad_responsable VARCHAR(200),
            marcacion VARCHAR(100),
            motivo_cierre TEXT,
            tiempo_gestion_dias DOUBLE PRECISION,
            tipo_pqr VARCHAR(50)
        );
    """)
    conn.commit()
    cur.close()
    print("✓ Table pqr_records created")


def load_data(conn, df: pl.DataFrame):
    """Insert DataFrame rows into pqr_records using batch inserts."""
    cur = conn.cursor()

    # Build column list matching what we have in the DataFrame
    columns = [
        "id_pqr", "fecha_creacion", "fecha_cierre", "estado", "causa",
        "canal_atencion", "empresa", "resultado", "unidad_responsable",
        "marcacion", "motivo_cierre", "tiempo_gestion_dias", "tipo_pqr"
    ]

    # Filter to only columns that exist in the DataFrame
    available_cols = [c for c in columns if c in df.columns]
    col_list = ", ".join(available_cols)
    placeholders = ", ".join(["%s"] * len(available_cols))

    insert_sql = f"INSERT INTO pqr_records ({col_list}) VALUES ({placeholders})"

    # Convert to list of tuples for batch insert
    batch_size = 1000
    rows = df.select(available_cols).rows()
    total = len(rows)

    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        # Convert Python date objects and handle None
        clean_batch = []
        for row in batch:
            clean_row = []
            for val in row:
                if val is None:
                    clean_row.append(None)
                else:
                    clean_row.append(val)
            clean_batch.append(tuple(clean_row))

        cur.executemany(insert_sql, clean_batch)
        conn.commit()
        pct = min(100, int((i + batch_size) / total * 100))
        print(f"\r  Loading... {pct}% ({min(i + batch_size, total)}/{total} records)", end="", flush=True)

    print(f"\n✓ Loaded {total} records into pqr_records")
    cur.close()


def create_indexes(conn):
    """Create indexes for common query patterns."""
    cur = conn.cursor()
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_pqr_causa ON pqr_records(causa);
        CREATE INDEX IF NOT EXISTS idx_pqr_estado ON pqr_records(estado);
        CREATE INDEX IF NOT EXISTS idx_pqr_empresa ON pqr_records(empresa);
        CREATE INDEX IF NOT EXISTS idx_pqr_canal ON pqr_records(canal_atencion);
        CREATE INDEX IF NOT EXISTS idx_pqr_fecha ON pqr_records(fecha_creacion);
        CREATE INDEX IF NOT EXISTS idx_pqr_tiempo ON pqr_records(tiempo_gestion_dias);
    """)
    conn.commit()
    cur.close()
    print("✓ Indexes created")


def main():
    try:
        import psycopg2
    except ImportError:
        print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
        sys.exit(1)

    if not CURATED_FILE.exists():
        print(f"ERROR: Curated Parquet not found at {CURATED_FILE}")
        print("Run the pipeline first: cd backend && python run_pipeline.py")
        sys.exit(1)

    print(f"Loading data from: {CURATED_FILE}")
    df = pl.read_parquet(CURATED_FILE)
    print(f"  Records: {df.height}, Columns: {df.width}")
    print(f"  Columns: {df.columns}")

    print(f"\nConnecting to Neon PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL)
    print("✓ Connected")

    create_table(conn)
    load_data(conn, df)
    create_indexes(conn)

    # Verify
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM pqr_records")
    count = cur.fetchone()[0]
    print(f"\n✓ Verification: {count} records in database")
    cur.close()

    conn.close()
    print("\n✅ Neon database seeded successfully!")
    print("   The Vercel API routes can now query pqr_records table.")


if __name__ == "__main__":
    main()
