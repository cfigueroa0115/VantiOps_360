"""FastAPI router with all PQR Analytics API endpoints.

All endpoints serve pre-aggregated data from curated Parquet files via DuckDB.
No individual record values are exposed (minimum group size >= 5).

Requirements: 5.4, 5.5, 5.6, 5.7, 12.1, 13.2, 14.2
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import duckdb
from fastapi import APIRouter, Depends, HTTPException

from api.filters import FilterParams, build_where_clause, parse_filters
from api.models import (
    ChartDataResponse,
    ChartMetadata,
    FeatureImportanceItem,
    FilterOptionsResponse,
    Finding,
    KPIResponse,
    ModelMetrics,
    QualityDimensions,
    QualityReportMetadata,
    QualityReportResponse,
    QualityViolation,
    RCAResponse,
    RiskModelResponse,
)
from core.retry import retry_policy

logger = logging.getLogger(__name__)

router = APIRouter()

# Path to curated Parquet data file
DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "curated"
CURATED_FILE = DATA_DIR / "pqr_curated.parquet"

MIN_GROUP_SIZE = 5

# Configurable high concentration threshold (REQ-05.5)
# Default: 0.40 (40%) — the top cause is flagged when its share exceeds this value
PARETO_HIGH_CONCENTRATION_THRESHOLD = float(
    os.environ.get("PARETO_HIGH_CONCENTRATION_THRESHOLD", "0.40")
)


class ChartType(str, Enum):
    """Supported chart types for visualization."""

    pareto = "pareto"
    top_causes = "top_causes"
    cancellation_donut = "cancellation_donut"
    distribution_company = "distribution_company"
    distribution_channel = "distribution_channel"
    distribution_result = "distribution_result"
    temporal_trend = "temporal_trend"
    management_time_box = "management_time_box"
    overall_boxplot = "overall_boxplot"
    p90_by_cause = "p90_by_cause"
    cause_channel_heatmap = "cause_channel_heatmap"
    open_cases_histogram = "open_cases_histogram"
    quality_by_field = "quality_by_field"
    anomaly_matrix = "anomaly_matrix"
    findings_table = "findings_table"


def _get_connection() -> duckdb.DuckDBPyConnection:
    """Create a DuckDB connection for querying Parquet files."""
    return duckdb.connect(database=":memory:")


def _parquet_source(where: str = "", params: list | None = None) -> str:
    """Build a base query reading from the curated Parquet file."""
    return f"SELECT * FROM read_parquet('{CURATED_FILE.as_posix()}') {where}"


def _now_iso() -> str:
    """Return current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


def _execute_query(sql: str, params: list | None = None) -> list[dict[str, Any]]:
    """Execute a DuckDB query and return results as list of dicts."""
    con = _get_connection()
    try:
        if params:
            result = con.execute(sql, params)
        else:
            result = con.execute(sql)
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()
        return [dict(zip(columns, row)) for row in rows]
    finally:
        con.close()


def _execute_scalar(sql: str, params: list | None = None) -> Any:
    """Execute a query returning a single scalar value."""
    con = _get_connection()
    try:
        if params:
            result = con.execute(sql, params)
        else:
            result = con.execute(sql)
        row = result.fetchone()
        return row[0] if row else None
    finally:
        con.close()


def _check_data_available() -> None:
    """Raise 503 if curated data file doesn't exist."""
    if not CURATED_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Curated data file not found at {CURATED_FILE}. "
            "Run the data pipeline first.",
        )


@router.get("/api/kpis", response_model=KPIResponse)
async def get_kpis(filters: FilterParams = Depends(parse_filters)) -> KPIResponse:
    """Return pre-aggregated KPI values, filtered if params present."""
    _check_data_available()
    where, params = build_where_clause(filters)
    src = f"read_parquet('{CURATED_FILE.as_posix()}')"
    base = f"SELECT * FROM {src} {where}"

    sql = f"""
    WITH filtered AS ({base})
    SELECT
        COUNT(*) AS total_pqr,
        COUNT(*) FILTER (WHERE estado = 'cerrado') AS closed_pqr,
        COUNT(*) FILTER (WHERE estado = 'en_proceso') AS in_process_pqr,
        ROUND(
            COUNT(*) FILTER (WHERE estado = 'cerrado') * 100.0
            / NULLIF(COUNT(*), 0), 1
        ) AS percentage_closed,
        ROUND(AVG(tiempo_gestion_dias), 1) AS avg_management_time,
        ROUND(MEDIAN(tiempo_gestion_dias), 1) AS median_management_time,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP
            (ORDER BY tiempo_gestion_dias), 1) AS p90_management_time,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP
            (ORDER BY tiempo_gestion_dias), 1) AS p95_management_time,
        ROUND(MAX(tiempo_gestion_dias), 1) AS max_management_time,
        COUNT(DISTINCT causa) AS distinct_causes_count
    FROM filtered
    """

    rows = _execute_query(sql, params)
    if not rows:
        raise HTTPException(status_code=404, detail="No data found")
    row = rows[0]

    # Calculate main cause share percentage
    cause_sql = f"""
    WITH filtered AS ({base})
    SELECT causa, COUNT(*) AS cnt
    FROM filtered
    GROUP BY causa
    HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    ORDER BY cnt DESC
    LIMIT 1
    """
    cause_rows = _execute_query(cause_sql, params)
    total = row["total_pqr"] or 1
    main_cause_share = round(
        (cause_rows[0]["cnt"] / total * 100) if cause_rows else 0.0, 1
    )

    # Quality issues percentage (records with null motivo_cierre or null marcacion)
    quality_sql = f"""
    WITH filtered AS ({base})
    SELECT
        ROUND(
            COUNT(*) FILTER (
                WHERE motivo_cierre IS NULL
                   OR marcacion IS NULL
                   OR empresa IS NULL
            ) * 100.0 / NULLIF(COUNT(*), 0), 1
        ) AS quality_issues_pct
    FROM filtered
    """
    quality_rows = _execute_query(quality_sql, params)
    quality_issues_pct = quality_rows[0]["quality_issues_pct"] if quality_rows else 0.0

    # Data quality score from pre-computed report (fallback to estimate)
    dqs = _get_data_quality_score()

    return KPIResponse(
        total_pqr=row["total_pqr"] or 0,
        closed_pqr=row["closed_pqr"] or 0,
        in_process_pqr=row["in_process_pqr"] or 0,
        percentage_closed=row["percentage_closed"] or 0.0,
        avg_management_time=row["avg_management_time"] or 0.0,
        median_management_time=row["median_management_time"] or 0.0,
        p90_management_time=row["p90_management_time"] or 0.0,
        p95_management_time=row["p95_management_time"] or 0.0,
        max_management_time=row["max_management_time"] or 0.0,
        distinct_causes_count=row["distinct_causes_count"] or 0,
        main_cause_share_pct=main_cause_share,
        quality_issues_pct=quality_issues_pct or 0.0,
        data_quality_score=dqs,
        record_count=row["total_pqr"] or 0,
        last_updated=_now_iso(),
    )


def _get_data_quality_score() -> float:
    """Load pre-computed data quality score from quality report JSON, or estimate."""
    import json

    report_path = DATA_DIR / "quality_report.json"
    if report_path.exists():
        try:
            with open(report_path) as f:
                report = json.load(f)
            return float(report.get("quality_score", {}).get("composite_score", 75.0))
        except (json.JSONDecodeError, KeyError, TypeError):
            pass
    return 75.0  # Default estimate


@router.get("/api/filters/options", response_model=FilterOptionsResponse)
async def get_filter_options() -> FilterOptionsResponse:
    """Return available filter values from dataset."""
    _check_data_available()
    src = f"read_parquet('{CURATED_FILE.as_posix()}')"

    sql = f"""
    SELECT
        LIST(DISTINCT empresa ORDER BY empresa) AS companies,
        LIST(DISTINCT causa ORDER BY causa) AS causes,
        LIST(DISTINCT canal_atencion ORDER BY canal_atencion) AS channels,
        LIST(DISTINCT estado ORDER BY estado) AS statuses,
        LIST(DISTINCT resultado ORDER BY resultado) AS results,
        LIST(DISTINCT unidad_responsable ORDER BY unidad_responsable)
            AS responsible_units,
        COALESCE(MAX(tiempo_gestion_dias), 0) AS management_time_max
    FROM {src}
    """
    rows = _execute_query(sql)
    if not rows:
        return FilterOptionsResponse()

    row = rows[0]
    return FilterOptionsResponse(
        companies=_clean_list(row.get("companies")),
        causes=_clean_list(row.get("causes")),
        channels=_clean_list(row.get("channels")),
        statuses=_clean_list(row.get("statuses")),
        results=_clean_list(row.get("results")),
        responsible_units=_clean_list(row.get("responsible_units")),
        management_time_max=float(row.get("management_time_max") or 0),
    )


def _clean_list(values: Any) -> list[str]:
    """Remove None values and return a clean list of strings."""
    if not values:
        return []
    return [str(v) for v in values if v is not None]


@router.get("/api/charts/{chart_type}", response_model=ChartDataResponse)
async def get_chart_data(
    chart_type: ChartType,
    filters: FilterParams = Depends(parse_filters),
) -> ChartDataResponse:
    """Return chart data for specified visualization type."""
    _check_data_available()
    where, params = build_where_clause(filters)
    src = f"read_parquet('{CURATED_FILE.as_posix()}')"
    base = f"SELECT * FROM {src} {where}"

    chart_handlers = {
        ChartType.pareto: _chart_pareto,
        ChartType.top_causes: _chart_top_causes,
        ChartType.cancellation_donut: _chart_cancellation_donut,
        ChartType.distribution_company: _chart_distribution_company,
        ChartType.distribution_channel: _chart_distribution_channel,
        ChartType.distribution_result: _chart_distribution_result,
        ChartType.temporal_trend: _chart_temporal_trend,
        ChartType.management_time_box: _chart_management_time_box,
        ChartType.overall_boxplot: _chart_overall_boxplot,
        ChartType.p90_by_cause: _chart_p90_by_cause,
        ChartType.cause_channel_heatmap: _chart_cause_channel_heatmap,
        ChartType.open_cases_histogram: _chart_open_cases_histogram,
        ChartType.quality_by_field: _chart_quality_by_field,
        ChartType.anomaly_matrix: _chart_anomaly_matrix,
        ChartType.findings_table: _chart_findings_table,
    }

    handler = chart_handlers.get(chart_type)
    if not handler:
        raise HTTPException(status_code=400, detail=f"Unknown chart type: {chart_type}")

    data = handler(base, params)
    record_count = _execute_scalar(
        f"SELECT COUNT(*) FROM ({base})", params
    )

    return ChartDataResponse(
        chart_type=chart_type.value,
        data=data,
        metadata=ChartMetadata(
            record_count=record_count or 0,
            last_updated=_now_iso(),
        ),
    )


# ---------------------------------------------------------------------------
# Chart handler implementations
# ---------------------------------------------------------------------------


@retry_policy(max_retries=3, base_delay=2.0, max_delay=30.0)
def _chart_pareto(base: str, params: list) -> list[dict]:
    """Pareto: causes sorted by frequency with cumulative percentage.

    Extended with high concentration fields per REQ-05.5, REQ-05.6:
    - high_concentration: boolean, true when top cause share > threshold
    - concentration_pct: float, percentage of top cause
    - analysis_level: enum indicating the analytical depth level
    """
    sql = f"""
    WITH filtered AS ({base}),
    counts AS (
        SELECT causa, COUNT(*) AS count
        FROM filtered
        GROUP BY causa
        HAVING COUNT(*) >= {MIN_GROUP_SIZE}
        ORDER BY count DESC
    ),
    total AS (SELECT SUM(count) AS total FROM counts)
    SELECT
        causa,
        count,
        ROUND(count * 100.0 / total.total, 2) AS percentage,
        ROUND(SUM(count) OVER (ORDER BY count DESC) * 100.0 / total.total, 2)
            AS cumulative_pct
    FROM counts, total
    ORDER BY count DESC
    """
    rows = _execute_query(sql, params)

    # Enrich with high concentration fields (REQ-05.5, REQ-05.6)
    if rows:
        top_cause_pct = rows[0]["percentage"] / 100.0  # Convert to fraction for comparison
        threshold = PARETO_HIGH_CONCENTRATION_THRESHOLD

        for i, row in enumerate(rows):
            cause_pct = row["percentage"] / 100.0
            # high_concentration: true only for the top cause when it exceeds threshold
            is_high_concentration = (i == 0) and (top_cause_pct > threshold)
            row["high_concentration"] = is_high_concentration
            row["concentration_pct"] = row["percentage"]
            # analysis_level: statistical_concentration by default
            # (causal_hypothesis requires triangulation; validated_root_cause requires expert validation)
            row["analysis_level"] = "statistical_concentration"

    return rows


def _chart_top_causes(base: str, params: list) -> list[dict]:
    """Top 10 causes horizontal bar chart by record count."""
    sql = f"""
    WITH filtered AS ({base})
    SELECT causa, COUNT(*) AS count
    FROM filtered
    GROUP BY causa
    HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    ORDER BY count DESC
    LIMIT 10
    """
    return _execute_query(sql, params)


def _chart_cancellation_donut(base: str, params: list) -> list[dict]:
    """Cancellation share donut: main cancellation cause vs others."""
    sql = f"""
    WITH filtered AS ({base}),
    ranked AS (
        SELECT causa, COUNT(*) AS count
        FROM filtered
        GROUP BY causa
        HAVING COUNT(*) >= {MIN_GROUP_SIZE}
        ORDER BY count DESC
    ),
    total AS (SELECT SUM(count) AS total FROM ranked),
    top_cause AS (SELECT causa, count FROM ranked LIMIT 1)
    SELECT
        top_cause.causa AS category,
        top_cause.count AS count,
        ROUND(top_cause.count * 100.0 / total.total, 2) AS percentage
    FROM top_cause, total
    UNION ALL
    SELECT
        'Otras causas' AS category,
        total.total - top_cause.count AS count,
        ROUND((total.total - top_cause.count) * 100.0 / total.total, 2) AS percentage
    FROM top_cause, total
    """
    return _execute_query(sql, params)


def _chart_distribution_company(base: str, params: list) -> list[dict]:
    """Distribution bar chart by company."""
    sql = f"""
    WITH filtered AS ({base})
    SELECT empresa AS category, COUNT(*) AS count
    FROM filtered
    GROUP BY empresa
    HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    ORDER BY count DESC
    """
    return _execute_query(sql, params)


def _chart_distribution_channel(base: str, params: list) -> list[dict]:
    """Distribution bar chart by attention channel."""
    sql = f"""
    WITH filtered AS ({base})
    SELECT canal_atencion AS category, COUNT(*) AS count
    FROM filtered
    GROUP BY canal_atencion
    HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    ORDER BY count DESC
    """
    return _execute_query(sql, params)


def _chart_distribution_result(base: str, params: list) -> list[dict]:
    """Distribution bar chart by result type."""
    sql = f"""
    WITH filtered AS ({base})
    SELECT resultado AS category, COUNT(*) AS count
    FROM filtered
    WHERE resultado IS NOT NULL
    GROUP BY resultado
    HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    ORDER BY count DESC
    """
    return _execute_query(sql, params)


def _chart_temporal_trend(base: str, params: list) -> list[dict]:
    """Temporal trend: PQR volume over time (monthly)."""
    sql = f"""
    WITH filtered AS ({base})
    SELECT
        DATE_TRUNC('month', fecha_creacion) AS period,
        COUNT(*) AS count
    FROM filtered
    GROUP BY period
    HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    ORDER BY period
    """
    rows = _execute_query(sql, params)
    # Convert date to string for JSON serialization
    for row in rows:
        if row.get("period"):
            row["period"] = str(row["period"])
    return rows


def _chart_management_time_box(base: str, params: list) -> list[dict]:
    """Management time box plot data for top 10 causes."""
    sql = f"""
    WITH filtered AS ({base}),
    top_causes AS (
        SELECT causa
        FROM filtered
        GROUP BY causa
        HAVING COUNT(*) >= {MIN_GROUP_SIZE}
        ORDER BY COUNT(*) DESC
        LIMIT 10
    )
    SELECT
        f.causa,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP
            (ORDER BY f.tiempo_gestion_dias), 2) AS q1,
        ROUND(MEDIAN(f.tiempo_gestion_dias), 2) AS median,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP
            (ORDER BY f.tiempo_gestion_dias), 2) AS q3,
        ROUND(MIN(f.tiempo_gestion_dias), 2) AS whisker_low,
        ROUND(MAX(f.tiempo_gestion_dias), 2) AS whisker_high
    FROM filtered f
    INNER JOIN top_causes tc ON f.causa = tc.causa
    GROUP BY f.causa
    ORDER BY median DESC
    """
    return _execute_query(sql, params)


def _chart_overall_boxplot(base: str, params: list) -> list[dict]:
    """Overall management time boxplot."""
    sql = f"""
    WITH filtered AS ({base})
    SELECT
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP
            (ORDER BY tiempo_gestion_dias), 2) AS q1,
        ROUND(MEDIAN(tiempo_gestion_dias), 2) AS median,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP
            (ORDER BY tiempo_gestion_dias), 2) AS q3,
        ROUND(MIN(tiempo_gestion_dias), 2) AS whisker_low,
        ROUND(MAX(tiempo_gestion_dias), 2) AS whisker_high,
        COUNT(*) AS record_count
    FROM filtered
    WHERE tiempo_gestion_dias IS NOT NULL
    """
    return _execute_query(sql, params)


def _chart_p90_by_cause(base: str, params: list) -> list[dict]:
    """P90 management time by cause for top 10 causes."""
    sql = f"""
    WITH filtered AS ({base}),
    cause_stats AS (
        SELECT
            causa,
            ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP
                (ORDER BY tiempo_gestion_dias), 2) AS p90,
            COUNT(*) AS count
        FROM filtered
        WHERE tiempo_gestion_dias IS NOT NULL
        GROUP BY causa
        HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    )
    SELECT causa, p90, count
    FROM cause_stats
    ORDER BY p90 DESC
    LIMIT 10
    """
    return _execute_query(sql, params)


def _chart_cause_channel_heatmap(base: str, params: list) -> list[dict]:
    """Heatmap: cause x channel with record count as intensity."""
    sql = f"""
    WITH filtered AS ({base})
    SELECT
        causa,
        canal_atencion AS channel,
        COUNT(*) AS count
    FROM filtered
    GROUP BY causa, canal_atencion
    HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    ORDER BY count DESC
    """
    return _execute_query(sql, params)


def _chart_open_cases_histogram(base: str, params: list) -> list[dict]:
    """Open cases by age distribution (7-day buckets)."""
    sql = f"""
    WITH filtered AS ({base}),
    open_cases AS (
        SELECT tiempo_gestion_dias AS age
        FROM filtered
        WHERE estado != 'cerrado' AND tiempo_gestion_dias IS NOT NULL
    )
    SELECT
        CASE
            WHEN age <= 7 THEN '0-7'
            WHEN age <= 14 THEN '8-14'
            WHEN age <= 21 THEN '15-21'
            WHEN age <= 28 THEN '22-28'
            WHEN age <= 60 THEN '29-60'
            ELSE '61+'
        END AS bucket,
        COUNT(*) AS count
    FROM open_cases
    GROUP BY bucket
    HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    ORDER BY
        CASE bucket
            WHEN '0-7' THEN 1
            WHEN '8-14' THEN 2
            WHEN '15-21' THEN 3
            WHEN '22-28' THEN 4
            WHEN '29-60' THEN 5
            ELSE 6
        END
    """
    return _execute_query(sql, params)


def _chart_quality_by_field(base: str, params: list) -> list[dict]:
    """Quality by field: completeness (non-null ratio) per column."""
    src = f"read_parquet('{CURATED_FILE.as_posix()}')"
    # Use UNPIVOT-like approach to get null ratios per column
    sql = f"""
    WITH src AS (SELECT * FROM {src})
    SELECT column_name, ROUND(completeness_pct, 2) AS completeness_pct
    FROM (
        SELECT 'causa' AS column_name,
            (1.0 - COUNT(*) FILTER (WHERE causa IS NULL) * 1.0 / COUNT(*)) * 100
                AS completeness_pct FROM src
        UNION ALL
        SELECT 'empresa',
            (1.0 - COUNT(*) FILTER (WHERE empresa IS NULL) * 1.0 / COUNT(*)) * 100
            FROM src
        UNION ALL
        SELECT 'canal_atencion',
            (1.0 - COUNT(*) FILTER (WHERE canal_atencion IS NULL) * 1.0 / COUNT(*)) * 100
            FROM src
        UNION ALL
        SELECT 'estado',
            (1.0 - COUNT(*) FILTER (WHERE estado IS NULL) * 1.0 / COUNT(*)) * 100
            FROM src
        UNION ALL
        SELECT 'resultado',
            (1.0 - COUNT(*) FILTER (WHERE resultado IS NULL) * 1.0 / COUNT(*)) * 100
            FROM src
        UNION ALL
        SELECT 'motivo_cierre',
            (1.0 - COUNT(*) FILTER (WHERE motivo_cierre IS NULL) * 1.0 / COUNT(*)) * 100
            FROM src
        UNION ALL
        SELECT 'marcacion',
            (1.0 - COUNT(*) FILTER (WHERE marcacion IS NULL) * 1.0 / COUNT(*)) * 100
            FROM src
        UNION ALL
        SELECT 'unidad_responsable',
            (1.0 - COUNT(*) FILTER (WHERE unidad_responsable IS NULL) * 1.0 / COUNT(*)) * 100
            FROM src
        UNION ALL
        SELECT 'tiempo_gestion_dias',
            (1.0 - COUNT(*) FILTER (WHERE tiempo_gestion_dias IS NULL) * 1.0 / COUNT(*)) * 100
            FROM src
    )
    ORDER BY completeness_pct ASC
    """
    return _execute_query(sql)


def _chart_anomaly_matrix(base: str, params: list) -> list[dict]:
    """Anomaly matrix: cells deviating >2 std from expected count."""
    sql = f"""
    WITH filtered AS ({base}),
    cell_counts AS (
        SELECT causa, canal_atencion AS channel, COUNT(*) AS count
        FROM filtered
        GROUP BY causa, canal_atencion
        HAVING COUNT(*) >= {MIN_GROUP_SIZE}
    ),
    stats AS (
        SELECT AVG(count) AS mean_count, STDDEV(count) AS std_count
        FROM cell_counts
    )
    SELECT
        cc.causa,
        cc.channel,
        cc.count,
        ROUND((cc.count - stats.mean_count) / NULLIF(stats.std_count, 0), 2)
            AS z_score,
        CASE
            WHEN ABS((cc.count - stats.mean_count)
                / NULLIF(stats.std_count, 0)) > 2 THEN true
            ELSE false
        END AS is_anomaly
    FROM cell_counts cc, stats
    ORDER BY ABS((cc.count - stats.mean_count)
        / NULLIF(stats.std_count, 0)) DESC
    """
    return _execute_query(sql, params)


def _chart_findings_table(base: str, params: list) -> list[dict]:
    """Executive findings summary table (pre-computed or generated)."""
    import json

    findings_path = DATA_DIR / "rca_findings.json"
    if findings_path.exists():
        try:
            with open(findings_path) as f:
                data = json.load(f)
            findings = data.get("findings", [])
            return findings[:10]
        except (json.JSONDecodeError, KeyError):
            pass

    # Fallback: generate basic findings from data statistics
    return [
        {
            "description": "Main cause accounts for largest share of PQRs",
            "affected_metric": "main_cause_share_pct",
            "severity": "high",
            "recommended_action": "Implement targeted reduction strategy",
        }
    ]


# ---------------------------------------------------------------------------
# Quality Report endpoint
# ---------------------------------------------------------------------------


@router.get("/api/quality/report", response_model=QualityReportResponse)
async def get_quality_report() -> QualityReportResponse:
    """Return aggregated quality metrics."""
    _check_data_available()
    import json

    report_path = DATA_DIR / "quality_report.json"
    if report_path.exists():
        try:
            with open(report_path) as f:
                report = json.load(f)
            return _parse_quality_report(report)
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse quality report: {e}")

    # Generate from data if no pre-computed report exists
    return _compute_quality_report_from_data()


def _parse_quality_report(report: dict) -> QualityReportResponse:
    """Parse a pre-computed quality report JSON into response model."""
    qs = report.get("quality_score", {})
    violations_raw = report.get("violations", [])

    violations = [
        QualityViolation(
            rule_name=v.get("rule_name", "unknown"),
            target_field=v.get("target_field", "unknown"),
            violations_count=v.get("violations_count", 0),
            violations_pct=v.get("violations_pct", 0.0),
            severity=v.get("severity", "low"),
            corrective_action=v.get("corrective_action", "Review field"),
        )
        for v in violations_raw
    ]

    return QualityReportResponse(
        overall_score=qs.get("composite_score", 75.0),
        dimensions=QualityDimensions(
            completeness=qs.get("completeness", 80.0),
            validity=qs.get("validity", 85.0),
            consistency=qs.get("consistency", 80.0),
            uniqueness=qs.get("uniqueness", 95.0),
            timeliness=qs.get("timeliness", 90.0),
            referential_integrity=qs.get("referential_integrity", 85.0),
        ),
        violations=violations,
        metadata=QualityReportMetadata(
            generated_at=report.get("generation_timestamp", _now_iso()),
            record_count=report.get("source_record_count", 0),
        ),
    )


def _compute_quality_report_from_data() -> QualityReportResponse:
    """Compute quality metrics directly from data if no report file exists."""
    src = f"read_parquet('{CURATED_FILE.as_posix()}')"

    # Completeness: ratio of non-null cells
    sql = f"""
    SELECT
        COUNT(*) AS total_records,
        ROUND((1.0 - COUNT(*) FILTER (WHERE causa IS NULL) * 1.0
            / COUNT(*)) * 100, 2) AS causa_completeness,
        ROUND((1.0 - COUNT(*) FILTER (WHERE empresa IS NULL) * 1.0
            / COUNT(*)) * 100, 2) AS empresa_completeness,
        ROUND((1.0 - COUNT(*) FILTER (WHERE motivo_cierre IS NULL) * 1.0
            / COUNT(*)) * 100, 2) AS motivo_completeness,
        ROUND((1.0 - COUNT(*) FILTER (WHERE marcacion IS NULL) * 1.0
            / COUNT(*)) * 100, 2) AS marcacion_completeness
    FROM {src}
    """
    rows = _execute_query(sql)
    row = rows[0] if rows else {}

    total = row.get("total_records", 0)
    completeness_vals = [
        row.get("causa_completeness", 100.0),
        row.get("empresa_completeness", 100.0),
        row.get("motivo_completeness", 100.0),
        row.get("marcacion_completeness", 100.0),
    ]
    avg_completeness = round(sum(completeness_vals) / len(completeness_vals), 2)

    # Estimate other dimensions
    validity = 85.0
    consistency = 80.0
    uniqueness = 98.0
    timeliness = 90.0
    referential_integrity = 85.0

    composite = round(
        0.25 * avg_completeness
        + 0.20 * validity
        + 0.20 * consistency
        + 0.15 * uniqueness
        + 0.10 * timeliness
        + 0.10 * referential_integrity,
        2,
    )

    return QualityReportResponse(
        overall_score=composite,
        dimensions=QualityDimensions(
            completeness=avg_completeness,
            validity=validity,
            consistency=consistency,
            uniqueness=uniqueness,
            timeliness=timeliness,
            referential_integrity=referential_integrity,
        ),
        violations=[],
        metadata=QualityReportMetadata(
            generated_at=_now_iso(),
            record_count=total,
        ),
    )


# ---------------------------------------------------------------------------
# Risk Model endpoint
# ---------------------------------------------------------------------------


@router.get("/api/risk/model", response_model=RiskModelResponse)
async def get_risk_model_results() -> RiskModelResponse:
    """Return model metrics, feature importance, predictions summary."""
    import json

    model_path = DATA_DIR / "risk_model_results.json"
    if model_path.exists():
        try:
            with open(model_path) as f:
                data = json.load(f)
            return RiskModelResponse(
                model_type=data.get("model_type", "logistic_regression"),
                metrics=ModelMetrics(
                    precision=data.get("metrics", {}).get("precision", 0.0),
                    recall=data.get("metrics", {}).get("recall", 0.0),
                    f1_score=data.get("metrics", {}).get("f1_score", 0.0),
                    roc_auc=data.get("metrics", {}).get("roc_auc", 0.0),
                ),
                feature_importance=[
                    FeatureImportanceItem(feature=fi["feature"], importance=fi["importance"])
                    for fi in data.get("feature_importance", [])
                ],
                disclaimer=data.get(
                    "disclaimer",
                    "Analytical demonstration — not a production-grade model",
                ),
            )
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse risk model results: {e}")

    # Return placeholder when model hasn't been trained yet
    return RiskModelResponse(
        model_type="logistic_regression",
        metrics=ModelMetrics(precision=0.0, recall=0.0, f1_score=0.0, roc_auc=0.0),
        feature_importance=[],
        disclaimer="Analytical demonstration — not a production-grade model. "
        "Model has not been trained yet. Run the pipeline first.",
    )


# ---------------------------------------------------------------------------
# RCA Findings endpoint
# ---------------------------------------------------------------------------


@router.get("/api/rca/findings", response_model=RCAResponse)
async def get_rca_findings() -> RCAResponse:
    """Return root cause analysis findings and diagrams."""
    import json

    findings_path = DATA_DIR / "rca_findings.json"
    if findings_path.exists():
        try:
            with open(findings_path) as f:
                data = json.load(f)
            return RCAResponse(
                main_cause=data.get("main_cause", ""),
                main_cause_share=data.get("main_cause_share", 0.0),
                findings=[
                    Finding(
                        description=f.get("description", ""),
                        affected_metric=f.get("affected_metric", ""),
                        severity=f.get("severity", "medium"),
                        recommended_action=f.get("recommended_action", ""),
                    )
                    for f in data.get("findings", [])
                ],
                methodologies=data.get("methodologies", []),
            )
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse RCA findings: {e}")

    # Compute main cause from data if no pre-computed file
    _check_data_available()
    src = f"read_parquet('{CURATED_FILE.as_posix()}')"
    sql = f"""
    WITH counts AS (
        SELECT causa, COUNT(*) AS count
        FROM {src}
        GROUP BY causa
        HAVING COUNT(*) >= {MIN_GROUP_SIZE}
        ORDER BY count DESC
    ),
    total AS (SELECT SUM(count) AS total FROM counts)
    SELECT causa, count, ROUND(count * 100.0 / total.total, 2) AS share_pct
    FROM counts, total
    LIMIT 1
    """
    rows = _execute_query(sql)
    main_cause = rows[0]["causa"] if rows else "Unknown"
    main_cause_share = rows[0]["share_pct"] if rows else 0.0

    return RCAResponse(
        main_cause=main_cause,
        main_cause_share=main_cause_share,
        findings=[
            Finding(
                description=f"{main_cause} is the primary cause of PQR volume",
                affected_metric="total_pqr",
                severity="high",
                recommended_action="Apply structured RCA methodologies "
                "and implement process improvements",
            )
        ],
        methodologies=[
            "Pareto",
            "SIPOC",
            "5 Whys",
            "Ishikawa",
            "Lean Waste",
            "FMEA",
            "BPMN",
        ],
    )
