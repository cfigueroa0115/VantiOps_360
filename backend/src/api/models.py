"""Pydantic response models for the PQR Analytics API.

All responses contain only aggregated data — no individual record values.
Minimum group size for any data point is 5 records.

Requirements: 5.4, 12.1, 13.2, 14.2
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class KPIResponse(BaseModel):
    """Pre-aggregated KPI values returned by GET /api/kpis."""

    total_pqr: int = Field(description="Total PQR record count")
    closed_pqr: int = Field(description="Closed PQR count")
    in_process_pqr: int = Field(description="In-process PQR count")
    percentage_closed: float = Field(description="Percentage of closed PQRs")
    avg_management_time: float = Field(description="Average management time in days")
    median_management_time: float = Field(description="Median management time in days")
    p90_management_time: float = Field(description="P90 management time in days")
    p95_management_time: float = Field(description="P95 management time in days")
    max_management_time: float = Field(description="Maximum management time in days")
    distinct_causes_count: int = Field(description="Number of distinct causes")
    main_cause_share_pct: float = Field(description="Main cause share as percentage")
    quality_issues_pct: float = Field(description="Percentage of records with quality issues")
    data_quality_score: float = Field(description="Composite data quality score (0-100)")
    record_count: int = Field(description="Number of records in current filter context")
    last_updated: str = Field(description="ISO timestamp of last data refresh")


class FilterOptionsResponse(BaseModel):
    """Available filter values from the dataset, returned by GET /api/filters/options."""

    companies: list[str] = Field(default_factory=list)
    causes: list[str] = Field(default_factory=list)
    channels: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)
    results: list[str] = Field(default_factory=list)
    responsible_units: list[str] = Field(default_factory=list)
    management_time_max: float = Field(default=0.0)


class ChartMetadata(BaseModel):
    """Metadata attached to chart data responses."""

    record_count: int
    last_updated: str


class ChartDataResponse(BaseModel):
    """Generic chart data response from GET /api/charts/{chart_type}."""

    chart_type: str
    data: list[dict] = Field(default_factory=list)
    metadata: ChartMetadata


class QualityDimensions(BaseModel):
    """Six quality dimensions with sub-scores (0-100 each)."""

    completeness: float
    validity: float
    consistency: float
    uniqueness: float
    timeliness: float
    referential_integrity: float


class QualityViolation(BaseModel):
    """Individual quality rule violation."""

    rule_name: str
    target_field: str
    violations_count: int
    violations_pct: float
    severity: str = Field(description="critical | high | medium | low")
    corrective_action: str


class QualityReportMetadata(BaseModel):
    """Metadata for the quality report."""

    generated_at: str
    record_count: int


class QualityReportResponse(BaseModel):
    """Aggregated quality metrics from GET /api/quality/report."""

    overall_score: float
    dimensions: QualityDimensions
    violations: list[QualityViolation] = Field(default_factory=list)
    metadata: QualityReportMetadata


class ModelMetrics(BaseModel):
    """Evaluation metrics for the risk model."""

    precision: float
    recall: float
    f1_score: float
    roc_auc: float


class FeatureImportanceItem(BaseModel):
    """Single feature importance entry."""

    feature: str
    importance: float


class RiskModelResponse(BaseModel):
    """Risk model results from GET /api/risk/model."""

    model_type: str = Field(description="logistic_regression | decision_tree")
    metrics: ModelMetrics
    feature_importance: list[FeatureImportanceItem] = Field(default_factory=list)
    disclaimer: str = Field(default="Analytical demonstration — not a production-grade model")


class Finding(BaseModel):
    """Single executive finding entry."""

    description: str
    affected_metric: str
    severity: str = Field(description="critical | high | medium | low")
    recommended_action: str


class RCAResponse(BaseModel):
    """Root cause analysis findings from GET /api/rca/findings."""

    main_cause: str
    main_cause_share: float
    findings: list[Finding] = Field(default_factory=list)
    methodologies: list[str] = Field(default_factory=list)
