"""Seed Neon PostgreSQL database with PQR data from the curated Parquet file.

Creates the pqr_records table and loads all records from the curated Parquet.

Usage:
    cd backend
    export DATABASE_URL="postgresql://..."
    python seed_neon.py

Environment:
    DATABASE_URL — Neon PostgreSQL connection string (required)
"""

import os
import sys
from pathlib import Path

import polars as pl

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is required.")
    print("Set it with: export DATABASE_URL='postgresql://...'")
    print("Or on Windows: set DATABASE_URL=postgresql://...")
    sys.exit(1)


from src.safety.seed_guard import assert_safe_seed_environment

assert_safe_seed_environment()

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
    from psycopg2.extras import execute_values

    cur = conn.cursor()
    columns = [
        "fecha_creacion", "fecha_cierre", "estado", "causa",
        "canal_atencion", "empresa", "resultado", "unidad_responsable",
        "marcacion", "motivo_cierre", "tiempo_gestion_dias", "tipo_pqr"
    ]
    available_cols = [c for c in columns if c in df.columns]
    col_list = ", ".join(available_cols)
    sub_df = df.select(available_cols)

    if "tiempo_gestion_dias" in sub_df.columns:
        sub_df = sub_df.with_columns(
            pl.col("tiempo_gestion_dias").cast(pl.Float64, strict=False)
        )
    if "estado" in sub_df.columns:
        sub_df = sub_df.with_columns(
            pl.col("estado").cast(pl.Utf8).str.to_lowercase().str.replace_all(r"\s+", "_")
        )

    rows = sub_df.rows()
    batch_size = 5000
    total = len(rows)

    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        template = "(" + ",".join(["%s"] * len(available_cols)) + ")"
        execute_values(
            cur,
            f"INSERT INTO pqr_records ({col_list}) VALUES %s",
            batch,
            template=template,
            page_size=5000,
        )
        conn.commit()
        print(f"\r  Loading... {min(i + batch_size, total)}/{total}", end="", flush=True)

    print(f"\n✓ Loaded {total} records into pqr_records")
    cur.close()


def create_indexes(conn):
    """Create indexes for common query patterns."""
    cur = conn.cursor()
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_causa ON pqr_records(causa);
        CREATE INDEX IF NOT EXISTS idx_estado ON pqr_records(estado);
        CREATE INDEX IF NOT EXISTS idx_empresa ON pqr_records(empresa);
        CREATE INDEX IF NOT EXISTS idx_canal ON pqr_records(canal_atencion);
        CREATE INDEX IF NOT EXISTS idx_fecha ON pqr_records(fecha_creacion);
        CREATE INDEX IF NOT EXISTS idx_tiempo ON pqr_records(tiempo_gestion_dias);
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

    print(f"\nConnecting to Neon PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL)
    print("✓ Connected")

    create_table(conn)
    load_data(conn, df)
    create_indexes(conn)

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM pqr_records")
    count = cur.fetchone()[0]
    print(f"\n✓ Verification: {count} records in database")
    cur.close()
    conn.close()
    print("\n✅ Neon database seeded successfully!")


if __name__ == "__main__":
    main()
