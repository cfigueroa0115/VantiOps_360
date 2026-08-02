"""Main cause identification and Pareto analysis for root cause analysis.

Implements:
- Main cause identification: confirm highest volume cause ≥45% share
- Pareto chart data: ranked cause table with cumulative percentages
- Structured summary: volume, percentage, temporal trend, channels, time stats,
  result distribution, related causes, operational impact

Requirements: 11.1, 11.2
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import polars as pl


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAIN_CAUSE_THRESHOLD = 0.45  # ≥45% share required to confirm main cause
MANUAL_HANDLING_MINUTES_PER_PQR = 15  # Assumed minutes of manual handling per PQR


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class MainCauseResult:
    """Result of main cause identification via Pareto ranking.

    Attributes:
        cause_name: The identified main cause name.
        record_count: Number of records attributed to this cause.
        percentage_share: Proportion of total PQR records (0.0 to 1.0).
        is_confirmed: True if percentage_share ≥ 45%.
        validation_message: Human-readable summary of the validation result.
    """

    cause_name: str
    record_count: int
    percentage_share: float
    is_confirmed: bool
    validation_message: str


@dataclass
class MainCauseSummary:
    """Comprehensive structured summary of the main cause.

    Attributes:
        cause_name: The main cause name.
        absolute_volume: Total record count for this cause.
        percentage_share: Proportion of total PQR records (0.0 to 1.0).
        temporal_trend: Monthly volumes as {YYYY-MM: count}.
        channels: Attention channel proportions as {channel: proportion}.
        time_stats: Management time statistics as {mean, median, p90}.
        result_distribution: Result category percentages as {result: percentage}.
        related_causes: Other cancellation-related causes [{cause, count, share}].
        combined_cancellation_share: Combined share of all cancellation-related causes.
        operational_impact_hours_per_month: Estimated manual hours consumed per month.
    """

    cause_name: str
    absolute_volume: int
    percentage_share: float
    temporal_trend: dict[str, int]
    channels: dict[str, float]
    time_stats: dict[str, float]
    result_distribution: dict[str, float]
    related_causes: list[dict[str, Any]]
    combined_cancellation_share: float
    operational_impact_hours_per_month: float


@dataclass
class ParetoChartData:
    """Data structure for Pareto chart visualization.

    Attributes:
        causes: Cause names ranked by frequency descending.
        counts: Record counts per cause (same order).
        percentages: Individual percentage share per cause.
        cumulative_percentages: Cumulative percentage after each cause.
        total_count: Total records across all causes.
    """

    causes: list[str]
    counts: list[int]
    percentages: list[float]
    cumulative_percentages: list[float]
    total_count: int


# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------


def identify_main_cause(
    df: pl.DataFrame, cause_col: str = "causa"
) -> MainCauseResult:
    """Identify the main cause via Pareto ranking and confirm ≥45% share.

    The function counts records per cause, ranks them in descending order,
    and checks whether the top-ranked cause accounts for at least 45% of
    all non-null records.

    Parameters
    ----------
    df : pl.DataFrame
        Input DataFrame containing PQR records with a cause column.
    cause_col : str
        Column name containing the cause classification (default: "causa").

    Returns
    -------
    MainCauseResult
        Identification result including confirmation status and validation message.
    """
    # Count frequencies per cause, sorted descending
    freq_df = (
        df.select(pl.col(cause_col))
        .drop_nulls()
        .group_by(cause_col)
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
    )

    total_count = int(freq_df.select(pl.col("count").sum()).item())

    if total_count == 0:
        return MainCauseResult(
            cause_name="",
            record_count=0,
            percentage_share=0.0,
            is_confirmed=False,
            validation_message="No records found for cause analysis.",
        )

    # Top cause is the first row
    top_row = freq_df.row(0, named=True)
    cause_name = str(top_row[cause_col])
    record_count = int(top_row["count"])
    percentage_share = record_count / total_count

    is_confirmed = percentage_share >= MAIN_CAUSE_THRESHOLD

    if is_confirmed:
        validation_message = (
            f"Main cause confirmed: '{cause_name}' accounts for "
            f"{percentage_share:.1%} of total PQR records ({record_count:,} of "
            f"{total_count:,}), exceeding the {MAIN_CAUSE_THRESHOLD:.0%} threshold."
        )
    else:
        validation_message = (
            f"Main cause NOT confirmed: '{cause_name}' accounts for only "
            f"{percentage_share:.1%} of total PQR records ({record_count:,} of "
            f"{total_count:,}), below the {MAIN_CAUSE_THRESHOLD:.0%} threshold."
        )

    return MainCauseResult(
        cause_name=cause_name,
        record_count=record_count,
        percentage_share=percentage_share,
        is_confirmed=is_confirmed,
        validation_message=validation_message,
    )


def build_main_cause_summary(
    df: pl.DataFrame,
    main_cause: str,
    cause_col: str = "causa",
) -> MainCauseSummary:
    """Build a comprehensive structured summary of the main cause.

    Produces: absolute volume, percentage share, temporal trend (monthly),
    attention channel proportions, management time statistics,
    result distribution, related cancellation causes with combined share,
    and estimated operational impact in manual hours per month.

    Parameters
    ----------
    df : pl.DataFrame
        Full PQR DataFrame with all records.
    main_cause : str
        The identified main cause name to analyze.
    cause_col : str
        Column name containing the cause classification (default: "causa").

    Returns
    -------
    MainCauseSummary
        Structured summary with all analytical dimensions.
    """
    # Filter to non-null cause rows for totals
    df_valid = df.filter(pl.col(cause_col).is_not_null())
    total_count = df_valid.height

    # Filter to main cause records
    df_main = df_valid.filter(pl.col(cause_col) == main_cause)
    absolute_volume = df_main.height
    percentage_share = absolute_volume / total_count if total_count > 0 else 0.0

    # --- Temporal trend (monthly volumes) ---
    temporal_trend = _compute_temporal_trend(df_main)

    # --- Channel proportions ---
    channels = _compute_channel_proportions(df_main)

    # --- Management time statistics ---
    time_stats = _compute_time_stats(df_main)

    # --- Result distribution ---
    result_distribution = _compute_result_distribution(df_main)

    # --- Related cancellation causes ---
    related_causes, combined_cancellation_share = _compute_related_causes(
        df_valid, main_cause, cause_col
    )

    # --- Operational impact (hours per month) ---
    operational_impact_hours_per_month = _compute_operational_impact(
        df_main, temporal_trend
    )

    return MainCauseSummary(
        cause_name=main_cause,
        absolute_volume=absolute_volume,
        percentage_share=percentage_share,
        temporal_trend=temporal_trend,
        channels=channels,
        time_stats=time_stats,
        result_distribution=result_distribution,
        related_causes=related_causes,
        combined_cancellation_share=combined_cancellation_share,
        operational_impact_hours_per_month=operational_impact_hours_per_month,
    )


def pareto_chart_data(df: pl.DataFrame, col: str) -> ParetoChartData:
    """Produce ranked cause data for Pareto chart visualization.

    All causes are ranked by frequency in descending order. Individual and
    cumulative percentages are computed for the full set (not truncated at
    80% like the statistical Pareto analysis).

    Parameters
    ----------
    df : pl.DataFrame
        Input DataFrame containing the column to analyze.
    col : str
        Column name for which to compute the Pareto chart data.

    Returns
    -------
    ParetoChartData
        Complete ranked cause list with counts, percentages, and cumulative
        percentages for chart rendering.
    """
    # Count frequencies per category, sorted descending
    freq_df = (
        df.select(pl.col(col))
        .drop_nulls()
        .group_by(col)
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
    )

    total_count = int(freq_df.select(pl.col("count").sum()).item())

    if total_count == 0:
        return ParetoChartData(
            causes=[],
            counts=[],
            percentages=[],
            cumulative_percentages=[],
            total_count=0,
        )

    causes: list[str] = []
    counts: list[int] = []
    percentages: list[float] = []
    cumulative_percentages: list[float] = []
    cumulative_sum = 0

    for row in freq_df.iter_rows(named=True):
        cat = str(row[col])
        count = int(row["count"])
        pct = count / total_count

        cumulative_sum += count
        cumulative_pct = cumulative_sum / total_count

        causes.append(cat)
        counts.append(count)
        percentages.append(round(pct, 6))
        cumulative_percentages.append(round(cumulative_pct, 6))

    return ParetoChartData(
        causes=causes,
        counts=counts,
        percentages=percentages,
        cumulative_percentages=cumulative_percentages,
        total_count=total_count,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _compute_temporal_trend(df_main: pl.DataFrame) -> dict[str, int]:
    """Compute monthly volume trend for the main cause.

    Groups records by month (YYYY-MM) using the 'fecha_creacion' column.
    """
    if "fecha_creacion" not in df_main.columns or df_main.height == 0:
        return {}

    # Ensure fecha_creacion is of Date or Datetime type for grouping
    trend_df = (
        df_main.select(pl.col("fecha_creacion"))
        .drop_nulls()
        .with_columns(
            pl.col("fecha_creacion").cast(pl.Date).dt.strftime("%Y-%m").alias("month")
        )
        .group_by("month")
        .agg(pl.len().alias("count"))
        .sort("month")
    )

    return {
        str(row["month"]): int(row["count"]) for row in trend_df.iter_rows(named=True)
    }


def _compute_channel_proportions(df_main: pl.DataFrame) -> dict[str, float]:
    """Compute attention channel proportions for the main cause."""
    channel_col = "canal_atencion"
    if channel_col not in df_main.columns or df_main.height == 0:
        return {}

    channel_df = (
        df_main.select(pl.col(channel_col))
        .drop_nulls()
        .group_by(channel_col)
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
    )

    total = int(channel_df.select(pl.col("count").sum()).item())
    if total == 0:
        return {}

    return {
        str(row[channel_col]): round(int(row["count"]) / total, 4)
        for row in channel_df.iter_rows(named=True)
    }


def _compute_time_stats(df_main: pl.DataFrame) -> dict[str, float]:
    """Compute management time statistics (mean, median, p90) for the main cause."""
    time_col = "tiempo_gestion_dias"
    if time_col not in df_main.columns or df_main.height == 0:
        return {"mean": 0.0, "median": 0.0, "p90": 0.0}

    time_series = df_main.select(pl.col(time_col)).drop_nulls()

    if time_series.height == 0:
        return {"mean": 0.0, "median": 0.0, "p90": 0.0}

    mean_val = float(time_series.select(pl.col(time_col).mean()).item())
    median_val = float(time_series.select(pl.col(time_col).median()).item())
    p90_val = float(
        time_series.select(pl.col(time_col).quantile(0.90, interpolation="linear")).item()
    )

    return {
        "mean": round(mean_val, 2),
        "median": round(median_val, 2),
        "p90": round(p90_val, 2),
    }


def _compute_result_distribution(df_main: pl.DataFrame) -> dict[str, float]:
    """Compute result category percentage distribution for the main cause."""
    result_col = "resultado"
    if result_col not in df_main.columns or df_main.height == 0:
        return {}

    result_df = (
        df_main.select(pl.col(result_col))
        .drop_nulls()
        .group_by(result_col)
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
    )

    total = int(result_df.select(pl.col("count").sum()).item())
    if total == 0:
        return {}

    return {
        str(row[result_col]): round(int(row["count"]) / total * 100, 2)
        for row in result_df.iter_rows(named=True)
    }


def _compute_related_causes(
    df_valid: pl.DataFrame, main_cause: str, cause_col: str
) -> tuple[list[dict[str, Any]], float]:
    """Find other cancellation-related causes and compute combined share.

    Identifies causes containing 'cancel' (case-insensitive) in their name,
    excluding the main cause itself, and computes the combined share of all
    cancellation-related causes (including the main cause).
    """
    total_count = df_valid.height
    if total_count == 0:
        return [], 0.0

    # Get all causes with counts
    freq_df = (
        df_valid.group_by(cause_col)
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
    )

    related_causes: list[dict[str, Any]] = []
    combined_cancellation_count = 0

    for row in freq_df.iter_rows(named=True):
        cause = str(row[cause_col])
        count = int(row["count"])
        share = count / total_count

        # Check if cause is cancellation-related (contains "cancel" case-insensitive)
        if "cancel" in cause.lower():
            combined_cancellation_count += count
            # Add to related list only if it's NOT the main cause
            if cause != main_cause:
                related_causes.append(
                    {"cause": cause, "count": count, "share": round(share, 6)}
                )

    combined_cancellation_share = combined_cancellation_count / total_count

    return related_causes, round(combined_cancellation_share, 6)


def _compute_operational_impact(
    df_main: pl.DataFrame, temporal_trend: dict[str, int]
) -> float:
    """Estimate operational impact in manual hours per month.

    Assumes 15 minutes of manual handling per PQR. Calculates average
    monthly volume and multiplies by handling time.
    """
    if not temporal_trend:
        # Fallback: use total volume / 12 as rough monthly estimate
        monthly_avg = df_main.height / 12.0 if df_main.height > 0 else 0.0
    else:
        num_months = len(temporal_trend)
        total_volume = sum(temporal_trend.values())
        monthly_avg = total_volume / num_months if num_months > 0 else 0.0

    # 15 minutes per PQR → hours per month
    hours_per_month = monthly_avg * MANUAL_HANDLING_MINUTES_PER_PQR / 60.0
    return round(hours_per_month, 2)
