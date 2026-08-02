"""Quality-related data models and enums.

Defines the core dataclasses for data quality assessment:
- SeverityLevel enum for quality rule violation classification
- ColumnQualityMetric for per-column quality metrics
- DatasetMetrics for dataset-level aggregate metrics
- QualityScore for the composite Data Quality Score (6 dimensions)
- QualityReport for the full structured quality report

Requirements: 12.6, 14.4
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class SeverityLevel(Enum):
    """Severity classification for quality rule violations.

    Thresholds based on violation percentage:
    - CRITICAL: >20% violations
    - HIGH: >10% to 20% violations
    - MEDIUM: >5% to 10% violations
    - LOW: ≤5% violations
    """

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

    @classmethod
    def from_percentage(cls, pct: float) -> SeverityLevel:
        """Classify severity based on violation/null percentage.

        Args:
            pct: The violation or null percentage (0-100 scale).

        Returns:
            The appropriate SeverityLevel.
        """
        if pct > 20.0:
            return cls.CRITICAL
        elif pct > 10.0:
            return cls.HIGH
        elif pct > 5.0:
            return cls.MEDIUM
        else:
            return cls.LOW


@dataclass(frozen=True, slots=True)
class ColumnQualityMetric:
    """Quality metrics for a single column.

    Attributes:
        column_name: Name of the column (snake_case).
        data_type: Inferred semantic data type (categorical, numeric, datetime, etc.).
        null_count: Number of null/missing values.
        null_percentage: Percentage of null values (0-100).
        unique_count: Number of distinct non-null values.
        outlier_count: Number of IQR-based outliers (numeric columns only).
        invalid_date_count: Number of unparseable date values (datetime columns only).
        semantic_similarity_groups: Groups of semantically similar category values.
        severity: Severity level based on null percentage.
    """

    column_name: str
    data_type: str
    null_count: int
    null_percentage: float
    unique_count: int
    outlier_count: int = 0
    invalid_date_count: int = 0
    semantic_similarity_groups: list[list[str]] = field(default_factory=list)
    severity: SeverityLevel = SeverityLevel.LOW


@dataclass(frozen=True, slots=True)
class DatasetMetrics:
    """Dataset-level aggregate quality metrics.

    Attributes:
        total_record_count: Total number of records in the dataset.
        total_column_count: Total number of columns in the dataset.
        overall_completeness_pct: Ratio of non-null values to total cells (0-100).
        overall_validity_pct: Ratio of values conforming to expected type/format (0-100).
        duplication_rate: Ratio of duplicate records to total records (0-100).
    """

    total_record_count: int
    total_column_count: int
    overall_completeness_pct: float
    overall_validity_pct: float
    duplication_rate: float


# Default weights for the Quality Score dimensions
QUALITY_WEIGHTS = {
    "completeness": 0.25,
    "validity": 0.20,
    "consistency": 0.20,
    "uniqueness": 0.15,
    "timeliness": 0.10,
    "referential_integrity": 0.10,
}


@dataclass(frozen=True, slots=True)
class QualityScore:
    """Composite Data Quality Score across six weighted dimensions.

    The composite score is the weighted sum of all dimension sub-scores,
    expressed as a percentage between 0% and 100%.

    Default weights:
    - Completeness: 25%
    - Validity: 20%
    - Consistency: 20%
    - Uniqueness: 15%
    - Timeliness: 10%
    - Referential Integrity: 10%

    Attributes:
        completeness: Non-null ratio per field, averaged (0-100).
        validity: Pandera schema conformance ratio (0-100).
        consistency: Absence of field contradictions (0-100).
        uniqueness: Absence of duplicate records on PQR id (0-100).
        timeliness: Records with valid temporal range (0-100).
        referential_integrity: Categorical values in domain catalogs (0-100).
        composite_score: Weighted sum of all dimensions (0-100).
    """

    completeness: float
    validity: float
    consistency: float
    uniqueness: float
    timeliness: float
    referential_integrity: float
    composite_score: float

    @classmethod
    def compute(
        cls,
        completeness: float,
        validity: float,
        consistency: float,
        uniqueness: float,
        timeliness: float,
        referential_integrity: float,
    ) -> QualityScore:
        """Compute the composite quality score from dimension sub-scores.

        Args:
            completeness: Completeness dimension score (0-100).
            validity: Validity dimension score (0-100).
            consistency: Consistency dimension score (0-100).
            uniqueness: Uniqueness dimension score (0-100).
            timeliness: Timeliness dimension score (0-100).
            referential_integrity: Referential integrity dimension score (0-100).

        Returns:
            A QualityScore instance with the computed composite score.
        """
        composite = (
            completeness * QUALITY_WEIGHTS["completeness"]
            + validity * QUALITY_WEIGHTS["validity"]
            + consistency * QUALITY_WEIGHTS["consistency"]
            + uniqueness * QUALITY_WEIGHTS["uniqueness"]
            + timeliness * QUALITY_WEIGHTS["timeliness"]
            + referential_integrity * QUALITY_WEIGHTS["referential_integrity"]
        )
        return cls(
            completeness=completeness,
            validity=validity,
            consistency=consistency,
            uniqueness=uniqueness,
            timeliness=timeliness,
            referential_integrity=referential_integrity,
            composite_score=round(composite, 2),
        )


@dataclass(frozen=True, slots=True)
class QualityReport:
    """Full structured quality report.

    Contains column-level metrics, dataset-level metrics, composite quality
    score, metadata header, and any errors encountered during profiling.

    Attributes:
        generation_timestamp: ISO 8601 timestamp of report generation.
        source_record_count: Number of records in the source dataset.
        schema_version: Version identifier for the report schema.
        columns: Per-column quality metrics.
        dataset_metrics: Dataset-level aggregate metrics.
        quality_score: Composite quality score across 6 dimensions.
        errors: List of profiling errors (column name + reason).
    """

    generation_timestamp: datetime
    source_record_count: int
    schema_version: str
    columns: list[ColumnQualityMetric]
    dataset_metrics: DatasetMetrics
    quality_score: QualityScore
    errors: list[dict[str, str]] = field(default_factory=list)
