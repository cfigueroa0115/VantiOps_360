"""Descriptive statistics and conditional probability calculations.

Implements descriptive statistics for numeric series (mean, median, mode,
variance, std, quartiles, percentiles, IQR, max) and conditional probability
computation with null exclusion and low-confidence flagging.

Requirements: 8.1, 8.2, 8.3, 8.4, 8.9, 9.1, 9.3
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import polars as pl

from profiling.detectors import detect_outliers_iqr

LOW_CONFIDENCE_THRESHOLD = 30

# Minimum group size for privacy protection (Requirement 9.3).
# Groups with fewer than MIN_GROUP_SIZE records are excluded from reports.
MIN_GROUP_SIZE = 5


@dataclass(frozen=True, slots=True)
class DescriptiveStats:
    """Descriptive statistics for a numeric series.

    Attributes:
        mean: Arithmetic mean rounded to 2 decimal places.
        median: Median (50th percentile) rounded to 2 decimal places.
        mode: Mode value rounded to 2 decimal places, or None if no unique mode.
        variance: Population variance rounded to 2 decimal places.
        std: Standard deviation rounded to 2 decimal places.
        max_val: Maximum value rounded to 2 decimal places.
        q1: 25th percentile rounded to 2 decimal places.
        q2: 50th percentile (same as median) rounded to 2 decimal places.
        q3: 75th percentile rounded to 2 decimal places.
        p90: 90th percentile rounded to 2 decimal places.
        p95: 95th percentile rounded to 2 decimal places.
        iqr: Interquartile range (Q3 - Q1) rounded to 2 decimal places.
        count: Number of non-null values.
        outlier_count: Number of outliers detected via IQR method.
        outlier_percentage: Percentage of non-null values that are outliers.
    """

    mean: float
    median: float
    mode: float | None
    variance: float
    std: float
    max_val: float
    q1: float
    q2: float
    q3: float
    p90: float
    p95: float
    iqr: float
    count: int
    outlier_count: int
    outlier_percentage: float


@dataclass(frozen=True, slots=True)
class ConditionalProbResult:
    """Result of a conditional probability calculation for a single group.

    Attributes:
        group_value: The value of the conditioning variable for this group.
        probability: P(target_condition | group) rounded to 4 decimal places.
        sample_size: Number of records in this group (after null exclusion).
        is_low_confidence: True if sample_size < 30.
        excluded_null_count: Number of records excluded due to null in group_col.
    """

    group_value: str
    probability: float
    sample_size: int
    is_low_confidence: bool
    excluded_null_count: int


def descriptive_stats(series: pl.Series) -> DescriptiveStats:
    """Calculate descriptive statistics for a numeric series.

    Uses Polars operations for efficient computation. All values are rounded
    to 2 decimal places. Outlier detection uses the IQR method via
    ``profiling.detectors.detect_outliers_iqr``.

    Args:
        series: Polars Series with numeric values. Null values are excluded.

    Returns:
        DescriptiveStats dataclass with all computed metrics.

    Requirements: 8.3, 8.4
    """
    non_null = series.drop_nulls().cast(pl.Float64, strict=False)
    count = len(non_null)

    if count == 0:
        return DescriptiveStats(
            mean=0.0,
            median=0.0,
            mode=None,
            variance=0.0,
            std=0.0,
            max_val=0.0,
            q1=0.0,
            q2=0.0,
            q3=0.0,
            p90=0.0,
            p95=0.0,
            iqr=0.0,
            count=0,
            outlier_count=0,
            outlier_percentage=0.0,
        )

    mean_val = round(float(non_null.mean()), 2)  # type: ignore[arg-type]
    median_val = round(float(non_null.median()), 2)  # type: ignore[arg-type]

    # Mode: most common value. If multiple modes exist, take the first.
    value_counts = non_null.value_counts().sort("count", descending=True)
    if value_counts.height > 0:
        top_count = value_counts["count"][0]
        # Check if mode is unique (only one value has the max count)
        modes_df = value_counts.filter(pl.col("count") == top_count)
        if modes_df.height == 1:
            mode_val: float | None = round(float(modes_df[non_null.name][0]), 2)
        else:
            # Multiple modes — return the smallest for determinism
            mode_val = round(float(modes_df[non_null.name].sort()[0]), 2)
    else:
        mode_val = None

    var_raw = non_null.var()
    variance_val = round(float(var_raw), 2) if var_raw is not None else 0.0
    std_raw = non_null.std()
    std_val = round(float(std_raw), 2) if std_raw is not None else 0.0

    max_raw = non_null.max()
    max_val = round(float(max_raw), 2) if max_raw is not None else 0.0

    q1_val = round(float(non_null.quantile(0.25, interpolation="linear")), 2)  # type: ignore[arg-type]
    q2_val = round(float(non_null.quantile(0.50, interpolation="linear")), 2)  # type: ignore[arg-type]
    q3_val = round(float(non_null.quantile(0.75, interpolation="linear")), 2)  # type: ignore[arg-type]
    p90_val = round(float(non_null.quantile(0.90, interpolation="linear")), 2)  # type: ignore[arg-type]
    p95_val = round(float(non_null.quantile(0.95, interpolation="linear")), 2)  # type: ignore[arg-type]

    iqr_val = round(q3_val - q1_val, 2)

    # Outlier detection using IQR method
    outlier_report = detect_outliers_iqr(non_null, column_name=series.name or "value")
    outlier_count = outlier_report.outlier_count
    outlier_percentage = round(outlier_report.outlier_percentage, 2)

    return DescriptiveStats(
        mean=mean_val,
        median=median_val,
        mode=mode_val,
        variance=variance_val,
        std=std_val,
        max_val=max_val,
        q1=q1_val,
        q2=q2_val,
        q3=q3_val,
        p90=p90_val,
        p95=p95_val,
        iqr=iqr_val,
        count=count,
        outlier_count=outlier_count,
        outlier_percentage=outlier_percentage,
    )


def conditional_probability(
    df: pl.DataFrame,
    target_col: str,
    target_condition: Callable[[pl.DataFrame], pl.Series],
    group_col: str,
) -> dict[str, ConditionalProbResult]:
    """Calculate conditional probability of a target condition given a grouping variable.

    P(target_condition | group_col = g) = count(target_condition & group=g) / count(group=g)

    Records with null in group_col are excluded from the calculation (Req 8.9).
    Groups with fewer than 30 records are flagged as low confidence (Req 8.2).

    Args:
        df: Polars DataFrame containing the data.
        target_col: Name of the target column (used for documentation, the
            actual condition is defined by target_condition).
        target_condition: Callable that takes a DataFrame and returns a boolean
            Series (mask) of the same length indicating which rows satisfy the
            target condition.
        group_col: Name of the column to group by (conditioning variable).

    Returns:
        Dictionary mapping group values (as strings) to ConditionalProbResult.

    Requirements: 8.1, 8.2, 8.9
    """
    # Count nulls excluded from group_col
    total_null_count = df[group_col].null_count()

    # Exclude records where group_col is null
    df_filtered = df.filter(pl.col(group_col).is_not_null())

    # Apply target condition to the filtered DataFrame
    condition_mask = target_condition(df_filtered)

    # Add condition as a column for grouped aggregation
    df_with_condition = df_filtered.with_columns(
        condition_mask.alias("__target_condition__")
    )

    # Group by group_col and calculate probability
    grouped = df_with_condition.group_by(group_col).agg(
        pl.col("__target_condition__").sum().alias("target_count"),
        pl.col("__target_condition__").count().alias("group_size"),
    )

    results: dict[str, ConditionalProbResult] = {}

    for row in grouped.iter_rows(named=True):
        group_value = str(row[group_col])
        target_count = int(row["target_count"])
        group_size = int(row["group_size"])

        probability = round(target_count / group_size, 4) if group_size > 0 else 0.0
        is_low_confidence = group_size < LOW_CONFIDENCE_THRESHOLD

        results[group_value] = ConditionalProbResult(
            group_value=group_value,
            probability=probability,
            sample_size=group_size,
            is_low_confidence=is_low_confidence,
            excluded_null_count=total_null_count,
        )

    return results


def descriptive_stats_tiempo_gestion(df: pl.DataFrame) -> DescriptiveStats:
    """Calculate descriptive statistics specifically for tiempo_gestion_dias.

    Convenience wrapper that extracts the `tiempo_gestion_dias` column
    from a DataFrame and computes full descriptive statistics.

    Args:
        df: Polars DataFrame containing a `tiempo_gestion_dias` column.

    Returns:
        DescriptiveStats dataclass with all computed metrics for the field.

    Requirements: 9.1
    """
    if "tiempo_gestion_dias" not in df.columns:
        raise ValueError("DataFrame must contain 'tiempo_gestion_dias' column")
    return descriptive_stats(df["tiempo_gestion_dias"])


def grouped_descriptive_stats(
    df: pl.DataFrame,
    value_col: str,
    group_col: str,
    min_group_size: int = MIN_GROUP_SIZE,
) -> dict[str, DescriptiveStats]:
    """Calculate descriptive statistics per group, excluding groups below MIN_GROUP_SIZE.

    Groups with fewer than `min_group_size` records are excluded from the
    results for privacy protection (Requirement 9.3).

    Args:
        df: Polars DataFrame containing value and group columns.
        value_col: Name of the numeric column to compute stats for.
        group_col: Name of the column to group by.
        min_group_size: Minimum number of records required per group (default 5).

    Returns:
        Dictionary mapping group values (as strings) to DescriptiveStats.
        Groups with fewer than min_group_size records are excluded.

    Requirements: 9.1, 9.3
    """
    results: dict[str, DescriptiveStats] = {}

    # Exclude nulls in group column
    df_filtered = df.filter(pl.col(group_col).is_not_null())

    # Get group sizes
    group_counts = df_filtered.group_by(group_col).agg(pl.len().alias("__count__"))

    for row in group_counts.iter_rows(named=True):
        group_value = str(row[group_col])
        group_size = int(row["__count__"])

        # Enforce MIN_GROUP_SIZE exclusion (Requirement 9.3)
        if group_size < min_group_size:
            continue

        group_df = df_filtered.filter(pl.col(group_col) == row[group_col])
        stats = descriptive_stats(group_df[value_col])
        results[group_value] = stats

    return results
