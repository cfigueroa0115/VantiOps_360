"""API startup helpers: ensure curated data and JSON artifacts are available.

This module provides functions to prepare the data layer before the API starts
serving requests. It bridges the pipeline orchestrator output (which writes to
``data/curated/Entrada_PQRs_curated.parquet``) with the API routes (which
expect ``data/curated/pqr_curated.parquet``).

Usage:
    from api.startup import ensure_curated_data
    ensure_curated_data()

Requirements: 5.2, 5.3, 7.2, 12.1, 12.2
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

# Resolve paths relative to the project root (backend/src/../../data)
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
CURATED_DIR = DATA_DIR / "curated"
RAW_DIR = DATA_DIR / "raw"

# File produced by the pipeline orchestrator
PIPELINE_OUTPUT = CURATED_DIR / "Entrada_PQRs_curated.parquet"
# File expected by the API routes
API_EXPECTED = CURATED_DIR / "pqr_curated.parquet"

# Source Excel file
SOURCE_EXCEL = RAW_DIR / "Entrada_PQRs.xlsx"


def ensure_curated_data(force_pipeline: bool = False) -> bool:
    """Ensure the curated Parquet file and JSON artifacts exist for the API.

    Strategy:
    1. If ``pqr_curated.parquet`` already exists and force is False, do nothing.
    2. If the pipeline output exists but the API-expected file doesn't, copy it.
    3. If neither exists, run the full pipeline from source Excel.
    4. Export quality report, risk model results, and RCA findings as JSON.

    Args:
        force_pipeline: If True, always re-run the pipeline regardless of state.

    Returns:
        True if data is ready for serving, False if preparation failed.
    """
    try:
        if not force_pipeline and API_EXPECTED.exists():
            logger.info("Curated data already available at %s", API_EXPECTED)
            _ensure_json_artifacts()
            return True

        # If pipeline output exists but API expected file doesn't, copy it
        if not force_pipeline and PIPELINE_OUTPUT.exists() and not API_EXPECTED.exists():
            logger.info("Copying pipeline output to API-expected path...")
            shutil.copy2(PIPELINE_OUTPUT, API_EXPECTED)
            _ensure_json_artifacts()
            return True

        # Run the full pipeline
        return _run_full_pipeline()

    except Exception as e:
        logger.error("Failed to ensure curated data: %s", e, exc_info=True)
        return False


def _run_full_pipeline() -> bool:
    """Run the full pipeline and export all artifacts.

    Returns:
        True if pipeline completed successfully.
    """
    import sys

    # Add src to path for pipeline imports
    src_dir = Path(__file__).resolve().parents[1]
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))

    from pipeline.orchestrator import PipelineConfig, PipelineOrchestrator

    if not SOURCE_EXCEL.exists():
        logger.error("Source Excel file not found: %s", SOURCE_EXCEL)
        return False

    logger.info("Running full pipeline on %s...", SOURCE_EXCEL)
    orchestrator = PipelineOrchestrator(output_dir=DATA_DIR)
    config = PipelineConfig(
        source_path=SOURCE_EXCEL,
        output_dir=DATA_DIR,
        force_reprocess=True,
    )
    result = orchestrator.run(SOURCE_EXCEL, config=config)

    if not result.success:
        logger.error("Pipeline failed: %s", result.message)
        return False

    logger.info("Pipeline completed: %s", result.message)

    # Normalize and copy to API-expected filename
    if PIPELINE_OUTPUT.exists() and PIPELINE_OUTPUT != API_EXPECTED:
        try:
            from run_pipeline import normalize_curated_data

            normalize_curated_data(PIPELINE_OUTPUT, API_EXPECTED)
        except ImportError:
            # Fallback: just copy if normalize isn't available
            shutil.copy2(PIPELINE_OUTPUT, API_EXPECTED)
        logger.info("Curated file prepared at %s", API_EXPECTED)

    # Export JSON artifacts
    _export_quality_report(result)
    _export_rca_findings(result)
    _export_risk_model_results()

    return True


def _ensure_json_artifacts() -> None:
    """Ensure JSON artifacts exist; generate them if missing."""
    quality_report_path = CURATED_DIR / "quality_report.json"
    rca_findings_path = CURATED_DIR / "rca_findings.json"
    risk_model_path = CURATED_DIR / "risk_model_results.json"

    if quality_report_path.exists() and rca_findings_path.exists() and risk_model_path.exists():
        return

    # Need to generate from curated data
    if not API_EXPECTED.exists():
        return

    logger.info("Generating missing JSON artifacts...")

    import polars as pl

    df = pl.read_parquet(API_EXPECTED)

    if not quality_report_path.exists():
        _generate_quality_report_json(df, quality_report_path)

    if not rca_findings_path.exists():
        _generate_rca_findings_json(df, rca_findings_path)

    if not risk_model_path.exists():
        _generate_risk_model_json(df, risk_model_path)


def _export_quality_report(result) -> None:
    """Export the pipeline quality report to JSON."""
    quality_report_path = CURATED_DIR / "quality_report.json"

    if result.quality_report is None or result.quality_score is None:
        return

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

    logger.info("Quality report exported to %s", quality_report_path)


def _export_rca_findings(result) -> None:
    """Export RCA findings from curated data to JSON."""
    rca_findings_path = CURATED_DIR / "rca_findings.json"

    if not API_EXPECTED.exists():
        return

    import polars as pl

    df = pl.read_parquet(API_EXPECTED)
    _generate_rca_findings_json(df, rca_findings_path)


def _export_risk_model_results() -> None:
    """Train and export risk model results to JSON."""
    risk_model_path = CURATED_DIR / "risk_model_results.json"

    if not API_EXPECTED.exists():
        return

    import polars as pl

    df = pl.read_parquet(API_EXPECTED)
    _generate_risk_model_json(df, risk_model_path)


def _generate_quality_report_json(df, output_path: Path) -> None:
    """Generate quality report JSON from a DataFrame."""
    import sys

    src_dir = Path(__file__).resolve().parents[1]
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))

    from quality.report_generator import QualityReportGenerator

    generator = QualityReportGenerator(id_column="id_pqr")
    report = generator.generate_report(df)

    report_data = {
        "generation_timestamp": report.generation_timestamp.isoformat(),
        "source_record_count": report.source_record_count,
        "schema_version": report.schema_version,
        "quality_score": {
            "completeness": report.quality_score.completeness,
            "validity": report.quality_score.validity,
            "consistency": report.quality_score.consistency,
            "uniqueness": report.quality_score.uniqueness,
            "timeliness": report.quality_score.timeliness,
            "referential_integrity": report.quality_score.referential_integrity,
            "composite_score": report.quality_score.composite_score,
        },
        "violations": [],
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2, ensure_ascii=False)

    logger.info("Quality report generated at %s", output_path)


def _generate_rca_findings_json(df, output_path: Path) -> None:
    """Generate RCA findings JSON from a DataFrame."""
    import sys

    src_dir = Path(__file__).resolve().parents[1]
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))

    from rca.main_cause import build_main_cause_summary, identify_main_cause

    main_cause_result = identify_main_cause(df, cause_col="causa")
    summary = build_main_cause_summary(df, main_cause_result.cause_name, cause_col="causa")

    findings_data = {
        "main_cause": main_cause_result.cause_name,
        "main_cause_share": round(main_cause_result.percentage_share * 100, 2),
        "is_confirmed": main_cause_result.is_confirmed,
        "validation_message": main_cause_result.validation_message,
        "findings": [
            {
                "description": (
                    f"'{main_cause_result.cause_name}' is the primary cause "
                    f"with {main_cause_result.percentage_share:.1%} share"
                ),
                "affected_metric": "total_pqr",
                "severity": "high" if main_cause_result.is_confirmed else "medium",
                "recommended_action": (
                    "Implement targeted process improvements for "
                    f"'{main_cause_result.cause_name}'"
                ),
            },
            {
                "description": (
                    f"Average management time: {summary.time_stats.get('mean', 0):.1f} days, "
                    f"P90: {summary.time_stats.get('p90', 0):.1f} days"
                ),
                "affected_metric": "avg_management_time",
                "severity": "medium",
                "recommended_action": "Optimize workflow for faster resolution",
            },
        ],
        "methodologies": [
            "Pareto",
            "SIPOC",
            "5 Whys",
            "Ishikawa",
            "Lean Waste",
            "FMEA",
            "BPMN",
        ],
        "temporal_trend": summary.temporal_trend,
        "channels": summary.channels,
        "time_stats": summary.time_stats,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(findings_data, f, indent=2, ensure_ascii=False)

    logger.info("RCA findings generated at %s", output_path)


def _generate_risk_model_json(df, output_path: Path) -> None:
    """Train risk model and export results to JSON."""
    import sys

    src_dir = Path(__file__).resolve().parents[1]
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))

    try:
        from risk.model import RiskModel

        model = RiskModel(random_seed=42)
        model_result = model.train(df)

        risk_data = {
            "model_type": model_result.metrics.model_type,
            "metrics": {
                "precision": model_result.metrics.precision,
                "recall": model_result.metrics.recall,
                "f1_score": model_result.metrics.f1_score,
                "roc_auc": model_result.metrics.roc_auc,
            },
            "feature_importance": [
                {"feature": fi.feature, "importance": fi.importance}
                for fi in model_result.feature_importance[:15]
            ],
            "p90_threshold": model_result.p90_threshold,
            "training_size": model_result.training_size,
            "test_size": model_result.test_size,
            "class_balance": model_result.class_balance,
            "limitations": model_result.limitations,
            "disclaimer": model_result.disclaimer,
        }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(risk_data, f, indent=2, ensure_ascii=False)

        logger.info("Risk model results exported to %s", output_path)

    except Exception as e:
        # Risk model training may fail if data doesn't have required features
        logger.warning("Risk model training failed: %s. Writing placeholder.", e)
        placeholder = {
            "model_type": "logistic_regression",
            "metrics": {"precision": 0.0, "recall": 0.0, "f1_score": 0.0, "roc_auc": 0.0},
            "feature_importance": [],
            "disclaimer": "Analytical demonstration — model training failed.",
        }
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(placeholder, f, indent=2, ensure_ascii=False)
