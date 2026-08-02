"""Run the full PQR Analytics pipeline end-to-end.

Executes: Excel → Raw → Staging → Validated → Curated → Serving
Exports:  quality_report.json, risk_model_results.json, rca_findings.json
Normalizes columns to the API-expected schema and writes pqr_curated.parquet.

Usage:
    cd backend
    python run_pipeline.py

Or from backend/src:
    python -m run_pipeline

Requirements: 5.2, 5.3, 7.2, 12.1, 12.2
"""

from __future__ import annotations

import json
import logging
import shutil
import sys
from pathlib import Path

import polars as pl

# Ensure src directory is on the Python path
SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

# Project root: backend/..
PROJECT_ROOT = Path(__file__).resolve().parent.parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("run_pipeline")

# Column mapping: raw (snake_case from Excel) → API-expected schema
COLUMN_RENAME_MAP = {
    "id_tck_pqr": "id_pqr",
    "origen": "canal_atencion",
    "dias_gestion": "tiempo_gestion_dias",
    "unidad_generadora": "unidad_responsable",
    "creado_el": "fecha_creacion",
    "fecha_finalizado": "fecha_cierre",
    "evento": "tipo_pqr",
    "fecha_radicacion": "fecha_radicacion",
}


def normalize_curated_data(source_path: Path, dest_path: Path) -> pl.DataFrame:
    """Normalize column names and types from raw curated to API-expected schema.

    Transformations:
    - Rename columns to match API route queries
    - Convert dias_gestion (string like '0001') to numeric tiempo_gestion_dias
    - Lowercase estado values (Cerrado → cerrado, En Proceso → en_proceso)
    - Convert Excel serial date integers to actual dates for fecha_creacion

    Args:
        source_path: Path to the pipeline-produced curated Parquet.
        dest_path: Path where the normalized Parquet should be written.

    Returns:
        The normalized DataFrame.
    """
    df = pl.read_parquet(source_path)

    # Rename columns that exist in the DataFrame
    rename_map = {k: v for k, v in COLUMN_RENAME_MAP.items() if k in df.columns}
    df = df.rename(rename_map)

    # Convert tiempo_gestion_dias from string to float
    if "tiempo_gestion_dias" in df.columns:
        df = df.with_columns(
            pl.col("tiempo_gestion_dias")
            .cast(pl.Utf8, strict=False)
            .str.strip_chars()
            .cast(pl.Float64, strict=False)
            .alias("tiempo_gestion_dias")
        )

    # Normalize estado to lowercase with underscores
    if "estado" in df.columns:
        df = df.with_columns(
            pl.col("estado")
            .str.to_lowercase()
            .str.replace_all(r"\s+", "_")
            .alias("estado")
        )

    # Convert Excel serial dates to actual dates for fecha_creacion
    if "fecha_creacion" in df.columns:
        df = df.with_columns(
            _excel_serial_to_date(pl.col("fecha_creacion")).alias("fecha_creacion")
        )

    # Convert fecha_cierre Excel serial to date
    if "fecha_cierre" in df.columns:
        df = df.with_columns(
            _excel_serial_to_date(pl.col("fecha_cierre")).alias("fecha_cierre")
        )

    # Write normalized curated file
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    df.write_parquet(dest_path, compression="snappy")
    logger.info("Normalized curated data written to %s (%d records)", dest_path, df.height)

    return df


def _excel_serial_to_date(col: pl.Expr) -> pl.Expr:
    """Convert an Excel serial number column to a Polars Date.

    Excel serial date: days since 1899-12-30 (with the Lotus 1-2-3 bug).
    Serial numbers below 60 are off by 1 due to the Feb 29, 1900 bug,
    but for modern dates (>60) the formula is: date = 1899-12-30 + serial days.
    """
    from datetime import date

    epoch = date(1899, 12, 30)
    return (
        col.cast(pl.Int64, strict=False)
        .map_elements(
            lambda serial: (
                date.fromordinal(epoch.toordinal() + int(serial))
                if serial is not None and int(serial) > 0
                else None
            ),
            return_dtype=pl.Date,
        )
    )


def main() -> int:
    """Execute the full pipeline and export all artifacts.

    Returns:
        0 on success, 1 on failure.
    """
    from api.startup import (
        API_EXPECTED,
        CURATED_DIR,
        DATA_DIR,
        PIPELINE_OUTPUT,
        SOURCE_EXCEL,
        _generate_rca_findings_json,
        _generate_risk_model_json,
    )
    from pipeline.orchestrator import PipelineConfig, PipelineOrchestrator

    # Validate source file exists
    if not SOURCE_EXCEL.exists():
        logger.error("Source Excel file not found: %s", SOURCE_EXCEL)
        logger.error("Expected at: data/raw/Entrada_PQRs.xlsx")
        return 1

    # --- Stage 1: Run pipeline ---
    logger.info("=" * 60)
    logger.info("PQR Analytics Pipeline - Full Execution")
    logger.info("=" * 60)
    logger.info("Source: %s", SOURCE_EXCEL)
    logger.info("Output: %s", DATA_DIR)

    orchestrator = PipelineOrchestrator(output_dir=DATA_DIR)
    config = PipelineConfig(
        source_path=SOURCE_EXCEL,
        output_dir=DATA_DIR,
        force_reprocess=True,
    )

    result = orchestrator.run(SOURCE_EXCEL, config=config)

    if not result.success:
        logger.error("Pipeline FAILED: %s", result.message)
        return 1

    logger.info("Pipeline SUCCESS: %s", result.message)

    # --- Stage 2: Normalize curated data to API-expected schema ---
    if PIPELINE_OUTPUT.exists():
        df = normalize_curated_data(PIPELINE_OUTPUT, API_EXPECTED)
        logger.info("Normalized curated Parquet → %s", API_EXPECTED.name)
    elif not API_EXPECTED.exists():
        logger.warning(
            "Pipeline output not found at expected location: %s",
            PIPELINE_OUTPUT,
        )
        return 1
    else:
        df = pl.read_parquet(API_EXPECTED)

    # --- Stage 3: Export quality report JSON ---
    quality_report_path = CURATED_DIR / "quality_report.json"
    if result.quality_report and result.quality_score:
        report_data = {
            "generation_timestamp": result.quality_report.generation_timestamp.isoformat(),
            "source_record_count": result.quality_report.source_record_count,
            "schema_version": result.quality_report.schema_version,
            "quality_score": {
                "completeness": result.quality_score.completeness,
                "validity": result.quality_score.validity,
                "consistency": result.quality_score.consistency,
                "uniqueness": result.quality_score.uniqueness,
                "timeliness": result.quality_score.timeliness,
                "referential_integrity": result.quality_score.referential_integrity,
                "composite_score": result.quality_score.composite_score,
            },
            "violations": [],
        }
        with open(quality_report_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        logger.info("Quality report → %s", quality_report_path.name)
    else:
        logger.warning("No quality report available to export.")

    # --- Stage 4: Export RCA findings JSON ---
    rca_path = CURATED_DIR / "rca_findings.json"
    _generate_rca_findings_json(df, rca_path)
    logger.info("RCA findings → %s", rca_path.name)

    # --- Stage 5: Export risk model results JSON ---
    risk_path = CURATED_DIR / "risk_model_results.json"
    _generate_risk_model_json(df, risk_path)
    logger.info("Risk model results → %s", risk_path.name)

    # --- Summary ---
    logger.info("=" * 60)
    logger.info("PIPELINE EXECUTION SUMMARY")
    logger.info("=" * 60)
    logger.info("Records ingested:    %d", result.batch.records_ingested)
    logger.info("Records validated:   %d", result.batch.records_validated)
    logger.info("Records quarantined: %d", result.batch.records_quarantined)
    logger.info("Processing time:     %.2fs", result.batch.processing_duration_seconds)
    if result.quality_score:
        logger.info("Quality score:       %.1f/100", result.quality_score.composite_score)
    logger.info("Output files:")
    logger.info("  - %s", API_EXPECTED)
    logger.info("  - %s", quality_report_path)
    logger.info("  - %s", rca_path)
    logger.info("  - %s", risk_path)
    logger.info("=" * 60)
    logger.info("API can now be started with:")
    logger.info("  cd backend/src && uvicorn api.main:app --reload")
    logger.info("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
