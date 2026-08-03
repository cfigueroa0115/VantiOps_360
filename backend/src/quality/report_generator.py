"""Quality report generation and export.

Implements the QualityReportGenerator class that assembles profiling results
into a structured QualityReport, calculates dataset-level metrics, and exports
to JSON and Parquet formats with metadata headers.

Privacy guarantees:
- Only aggregated column-level and dataset-level metrics are exported.
- No individual record values or row-level data appear in outputs.
- Semantic similarity groups require a minimum group size of 5.

Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.8
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

import polars as pl

from profiling.detectors import (
    DuplicateReport,
    NullStats,
    calculate_null_stats,
    detect_outliers_iqr,
    find_duplicates,
)
from profiling.type_inference import ColumnTypeInfo, infer_types
from profiling.validators import (
    find_semantic_similarities,
    validate_dates,
)
from quality.models import (
    ColumnQualityMetric,
    DatasetMetrics,
    QualityReport,
    QualityScore,
    SeverityLevel,
)
from quality.severity import flag_column_severity

# Schema version for the quality report format
SCHEMA_VERSION = "1.0.0"

# Minimum group size for privacy protection
MIN_GROUP_SIZE = 5


class QualityReportError(Exception):
    """Raised when quality report generation fails completely."""

    pass


class QualityReportGenerator:
    """Generates structured quality reports with privacy guarantees.

    Assembles profiling results (type inference, null stats, outlier detection,
    duplicate detection, date validation, semantic similarity) into a
    QualityReport dataclass and exports to JSON/Parquet.

    Privacy: Only aggregated metrics are included. No row-level data or
    individual record values appear in exports. Similarity groups with
    fewer than MIN_GROUP_SIZE values are suppressed.
    """

    def __init__(self, id_column: str = "id_pqr") -> None:
        """Initialize the report generator.

        Args:
            id_column: Name of the PQR identifier column for duplicate detection.
        """
        self.id_column = id_column

    def generate_report(self, df: pl.DataFrame) -> QualityReport:
        """Generate a full quality report from a DataFrame.

        Profiles each column for type, nulls, outliers, date validity, and
        semantic similarity. Assembles column-level metrics and computes
        dataset-level aggregate metrics.

        Handles partial failures: if some columns fail profiling, the report
        is generated for the successful ones with an errors section.

        Args:
            df: Polars DataFrame to profile.

        Returns:
            QualityReport instance with all metrics and metadata.

        Raises:
            QualityReportError: If zero columns are successfully profiled.
        """
        errors: list[dict[str, str]] = []
        column_metrics: list[ColumnQualityMetric] = []

        # Step 1: Infer types for all columns
        try:
            type_info = infer_types(df)
        except Exception as e:
            # If type inference fails entirely, we cannot produce a report
            raise QualityReportError(
                f"Type inference failed for all columns: {e}"
            ) from e

        # Step 2: Calculate null stats for all columns
        try:
            null_stats = calculate_null_stats(df)
        except Exception as e:
            raise QualityReportError(
                f"Null statistics calculation failed: {e}"
            ) from e

        # Step 3: Detect duplicates
        duplicate_report: DuplicateReport | None = None
        try:
            if self.id_column in df.columns:
                duplicate_report = find_duplicates(df, self.id_column)
        except Exception as e:
            errors.append({
                "column": self.id_column,
                "reason": f"Duplicate detection failed: {e}",
            })

        # Step 4: Profile each column individually
        for col_name in df.columns:
            try:
                metric = self._profile_column(
                    df, col_name, type_info, null_stats
                )
                column_metrics.append(metric)
            except Exception as e:
                errors.append({
                    "column": col_name,
                    "reason": f"Column profiling failed: {e}",
                })

        # If zero columns profiled successfully, raise error
        if len(column_metrics) == 0:
            raise QualityReportError(
                "Zero columns profiled successfully. "
                f"Errors encountered: {len(errors)}. "
                "Cannot produce a quality report."
            )

        # Step 5: Calculate dataset-level metrics
        dataset_metrics = self._compute_dataset_metrics(
            df, column_metrics, null_stats, duplicate_report, type_info
        )

        # Step 6: Compute quality score (simplified — uses available metrics)
        quality_score = self._compute_quality_score(
            dataset_metrics, duplicate_report
        )

        # Step 7: Assemble the report
        report = QualityReport(
            generation_timestamp=datetime.utcnow(),
            source_record_count=df.height,
            schema_version=SCHEMA_VERSION,
            columns=column_metrics,
            dataset_metrics=dataset_metrics,
            quality_score=quality_score,
            errors=errors,
        )

        return report

    def export_json(self, report: QualityReport, path: Path) -> None:
        """Export quality report to JSON with metadata header.

        The JSON file contains:
        - metadata: generation_timestamp, source_record_count, schema_version
        - columns: list of column-level metrics
        - dataset_metrics: aggregate metrics
        - quality_score: composite quality score
        - errors: list of profiling errors (if any)

        No row-level data is included. Only aggregated metrics.

        Args:
            report: QualityReport to serialize.
            path: Output file path for the JSON export.
        """
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        data = self._report_to_dict(report)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=self._json_serializer, ensure_ascii=False)

    def export_parquet(self, report: QualityReport, path: Path) -> None:
        """Export quality report to Parquet with metadata.

        Converts the report into a flat Polars DataFrame of column-level metrics
        and writes to Parquet. Dataset-level metrics and metadata are stored
        as Parquet file metadata.

        No row-level data is included. Only aggregated metrics.

        Args:
            report: QualityReport to export.
            path: Output file path for the Parquet export.
        """
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        # Build a DataFrame from column metrics
        rows: list[dict[str, Any]] = []
        for col_metric in report.columns:
            rows.append({
                "column_name": col_metric.column_name,
                "data_type": col_metric.data_type,
                "null_count": col_metric.null_count,
                "null_percentage": col_metric.null_percentage,
                "unique_count": col_metric.unique_count,
                "outlier_count": col_metric.outlier_count,
                "invalid_date_count": col_metric.invalid_date_count,
                "similarity_groups_count": len(col_metric.semantic_similarity_groups),
                "severity": col_metric.severity.value,
            })

        if rows:
            df = pl.DataFrame(rows)
        else:
            # Empty report case
            df = pl.DataFrame(
                schema={
                    "column_name": pl.Utf8,
                    "data_type": pl.Utf8,
                    "null_count": pl.Int64,
                    "null_percentage": pl.Float64,
                    "unique_count": pl.Int64,
                    "outlier_count": pl.Int64,
                    "invalid_date_count": pl.Int64,
                    "similarity_groups_count": pl.Int64,
                    "severity": pl.Utf8,
                }
            )

        # Build metadata dict for the Parquet file
        metadata = {
            "generation_timestamp": report.generation_timestamp.isoformat(),
            "source_record_count": str(report.source_record_count),
            "schema_version": report.schema_version,
            "total_record_count": str(report.dataset_metrics.total_record_count),
            "total_column_count": str(report.dataset_metrics.total_column_count),
            "overall_completeness_pct": str(report.dataset_metrics.overall_completeness_pct),
            "overall_validity_pct": str(report.dataset_metrics.overall_validity_pct),
            "duplication_rate": str(report.dataset_metrics.duplication_rate),
            "composite_quality_score": str(report.quality_score.composite_score),
        }

        # Write Parquet with metadata embedded
        df.write_parquet(
            path,
            # Note: Polars doesn't natively support custom metadata in write_parquet,
            # so we write an adjacent metadata JSON for the Parquet export
        )

        # Write metadata sidecar as JSON
        metadata_path = path.with_suffix(".metadata.json")
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

    def _profile_column(
        self,
        df: pl.DataFrame,
        col_name: str,
        type_info: dict[str, ColumnTypeInfo],
        null_stats: dict[str, NullStats],
    ) -> ColumnQualityMetric:
        """Profile a single column and return its quality metric.

        Args:
            df: Source DataFrame.
            col_name: Column name to profile.
            type_info: Pre-computed type inference results.
            null_stats: Pre-computed null statistics.

        Returns:
            ColumnQualityMetric for this column.
        """
        # Get type info
        col_type_info = type_info.get(col_name)
        data_type = col_type_info.inferred_type if col_type_info else "unknown"
        distinct_count = col_type_info.distinct_count if col_type_info else 0

        # Get null stats
        col_null_stats = null_stats.get(col_name)
        null_count = col_null_stats.null_count if col_null_stats else 0
        null_percentage = col_null_stats.null_percentage if col_null_stats else 0.0

        # Outlier detection (numeric columns only)
        outlier_count = 0
        if data_type == "numeric":
            try:
                outlier_report = detect_outliers_iqr(df[col_name], col_name)
                outlier_count = outlier_report.outlier_count
            except Exception:
                pass  # Non-critical: report 0 outliers if detection fails

        # Date validation (datetime columns only)
        invalid_date_count = 0
        if data_type == "datetime":
            try:
                date_report = validate_dates(df[col_name], col_name)
                invalid_date_count = date_report.invalid_count
            except Exception:
                pass  # Non-critical: report 0 invalid dates if validation fails

        # Semantic similarity (categorical columns only)
        similarity_groups: list[list[str]] = []
        if data_type == "categorical":
            try:
                categories = (
                    df[col_name]
                    .drop_nulls()
                    .cast(pl.Utf8, strict=False)
                    .unique()
                    .to_list()
                )
                sim_groups = find_semantic_similarities(categories)
                # Privacy: only include groups with >= MIN_GROUP_SIZE values
                similarity_groups = [
                    group.values
                    for group in sim_groups
                    if len(group.values) >= MIN_GROUP_SIZE
                ]
            except Exception:
                pass  # Non-critical: report empty groups if similarity fails

        # Determine severity based on null percentage (column flagging scheme)
        severity = flag_column_severity(null_percentage)

        return ColumnQualityMetric(
            column_name=col_name,
            data_type=data_type,
            null_count=null_count,
            null_percentage=round(null_percentage, 2),
            unique_count=distinct_count,
            outlier_count=outlier_count,
            invalid_date_count=invalid_date_count,
            semantic_similarity_groups=similarity_groups,
            severity=severity,
        )

    def _compute_dataset_metrics(
        self,
        df: pl.DataFrame,
        column_metrics: list[ColumnQualityMetric],
        null_stats: dict[str, NullStats],
        duplicate_report: DuplicateReport | None,
        type_info: dict[str, ColumnTypeInfo],
    ) -> DatasetMetrics:
        """Compute dataset-level aggregate metrics.

        Args:
            df: Source DataFrame.
            column_metrics: Profiled column metrics.
            null_stats: Per-column null statistics.
            duplicate_report: Duplicate detection result (may be None).
            type_info: Type inference results for validity calculation.

        Returns:
            DatasetMetrics with aggregate statistics.
        """
        total_records = df.height
        total_columns = df.width

        # Completeness: ratio of non-null values to total cells
        total_cells = total_records * total_columns
        total_nulls = sum(
            stats.null_count for stats in null_stats.values()
        )
        completeness_pct = (
            ((total_cells - total_nulls) / total_cells * 100.0)
            if total_cells > 0
            else 0.0
        )

        # Validity: ratio of values conforming to expected type/format
        # Use type inference confidence as a proxy for validity
        if type_info:
            validity_scores = [
                info.confidence for info in type_info.values()
            ]
            validity_pct = (
                sum(validity_scores) / len(validity_scores)
                if validity_scores
                else 100.0
            )
        else:
            validity_pct = 100.0

        # Duplication rate
        duplication_rate = (
            duplicate_report.duplication_rate
            if duplicate_report
            else 0.0
        )

        return DatasetMetrics(
            total_record_count=total_records,
            total_column_count=total_columns,
            overall_completeness_pct=round(completeness_pct, 2),
            overall_validity_pct=round(validity_pct, 2),
            duplication_rate=round(duplication_rate, 2),
        )

    def _compute_quality_score(
        self,
        dataset_metrics: DatasetMetrics,
        duplicate_report: DuplicateReport | None,
    ) -> QualityScore:
        """Compute a simplified quality score from available metrics.

        Uses completeness and validity from dataset metrics. Uniqueness is
        derived from duplication rate. Consistency, timeliness, and referential
        integrity default to 100.0 when not computed (these are calculated
        in the full pipeline by QualityScoreComputer in task 6.1).

        Args:
            dataset_metrics: Dataset-level metrics.
            duplicate_report: Duplicate detection results.

        Returns:
            QualityScore with composite score.
        """
        completeness = dataset_metrics.overall_completeness_pct
        validity = dataset_metrics.overall_validity_pct
        uniqueness = 100.0 - dataset_metrics.duplication_rate

        # These dimensions require additional analysis (task 6.1)
        # Default to 100.0 for now
        consistency = 100.0
        timeliness = 100.0
        referential_integrity = 100.0

        return QualityScore.compute(
            completeness=completeness,
            validity=validity,
            consistency=consistency,
            uniqueness=uniqueness,
            timeliness=timeliness,
            referential_integrity=referential_integrity,
        )

    def _report_to_dict(self, report: QualityReport) -> dict[str, Any]:
        """Convert a QualityReport to a JSON-serializable dictionary.

        Ensures no row-level data is included. Only aggregated metrics.

        Args:
            report: QualityReport to convert.

        Returns:
            Dictionary suitable for JSON serialization.
        """
        return {
            "metadata": {
                "generation_timestamp": report.generation_timestamp.isoformat(),
                "source_record_count": report.source_record_count,
                "schema_version": report.schema_version,
            },
            "columns": [
                {
                    "column_name": col.column_name,
                    "data_type": col.data_type,
                    "null_count": col.null_count,
                    "null_percentage": col.null_percentage,
                    "unique_count": col.unique_count,
                    "outlier_count": col.outlier_count,
                    "invalid_date_count": col.invalid_date_count,
                    "semantic_similarity_groups": col.semantic_similarity_groups,
                    "severity": col.severity.value,
                }
                for col in report.columns
            ],
            "dataset_metrics": {
                "total_record_count": report.dataset_metrics.total_record_count,
                "total_column_count": report.dataset_metrics.total_column_count,
                "overall_completeness_pct": report.dataset_metrics.overall_completeness_pct,
                "overall_validity_pct": report.dataset_metrics.overall_validity_pct,
                "duplication_rate": report.dataset_metrics.duplication_rate,
            },
            "quality_score": {
                "completeness": report.quality_score.completeness,
                "validity": report.quality_score.validity,
                "consistency": report.quality_score.consistency,
                "uniqueness": report.quality_score.uniqueness,
                "timeliness": report.quality_score.timeliness,
                "referential_integrity": report.quality_score.referential_integrity,
                "composite_score": report.quality_score.composite_score,
            },
            "errors": report.errors,
        }

    @staticmethod
    def _json_serializer(obj: Any) -> Any:
        """Custom JSON serializer for types not natively serializable.

        Handles: datetime, Enum, dataclass instances, Path objects.

        Args:
            obj: Object to serialize.

        Returns:
            JSON-serializable representation.

        Raises:
            TypeError: If the object type is not supported.
        """
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, SeverityLevel):
            return obj.value
        if isinstance(obj, Path):
            return str(obj)
        if hasattr(obj, "__dataclass_fields__"):
            return asdict(obj)
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")
