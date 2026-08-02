"""Outlier detection, null statistics, and duplicate detection for data profiling.

Implements IQR-based outlier detection, per-column null statistics, and
identifier-based duplicate detection using Polars for efficient computation.

Requirements: 2.3, 2.4, 2.5
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import polars as pl


@dataclass(frozen=True, slots=True)
class OutlierReport:
    """Report of IQR-based outlier detection for a numeric column.

    Attributes:
        column_name: Name of the analyzed column.
        q1: First quartile (25th percentile).
        q3: Third quartile (75th percentile).
        iqr: Interquartile range (Q3 - Q1).
        lower_bound: Q1 - 1.5 * IQR.
        upper_bound: Q3 + 1.5 * IQR.
        outlier_count: Number of values outside [lower_bound, upper_bound].
        outlier_percentage: Percentage of non-null values that are outliers.
        total_count: Total number of non-null values analyzed.
    """

    column_name: str
    q1: float
    q3: float
    iqr: float
    lower_bound: float
    upper_bound: float
    outlier_count: int
    outlier_percentage: float
    total_count: int


@dataclass(frozen=True, slots=True)
class NullStats:
    """Null value statistics for a single column.

    Attributes:
        column_name: Name of the analyzed column.
        null_count: Number of null/None/NaN values.
        null_percentage: Percentage of total rows that are null (0-100).
        total_count: Total number of rows in the column.
    """

    column_name: str
    null_count: int
    null_percentage: float
    total_count: int


@dataclass(frozen=True, slots=True)
class DuplicateReport:
    """Report of duplicate detection by identifier column.

    Attributes:
        id_column: Name of the identifier column used for detection.
        total_records: Total number of records in the DataFrame.
        distinct_identifiers: Number of distinct non-null identifier values.
        duplicate_count: Number of duplicate records (total_records - distinct_identifiers).
        duplication_rate: Percentage of duplicate records (0-100).
        duplicate_ids: List of identifier values that appear more than once.
    """

    id_column: str
    total_records: int
    distinct_identifiers: int
    duplicate_count: int
    duplication_rate: float
    duplicate_ids: list[Any] = field(default_factory=list)


def detect_outliers_iqr(series: pl.Series, column_name: str | None = None) -> OutlierReport:
    """Detect outliers using IQR-based method.

    A value is flagged as an outlier if and only if it is below Q1 - 1.5*IQR
    or above Q3 + 1.5*IQR, where Q1 and Q3 are the 25th and 75th percentiles
    and IQR = Q3 - Q1.

    Null values are excluded from the calculation. If the series is empty or
    all-null, returns zero counts. If IQR = 0 (all same values), no outliers
    are reported.

    Args:
        series: Polars Series with numeric values.
        column_name: Optional name for the report. Defaults to the series name.

    Returns:
        OutlierReport with detection results.

    Requirements: 2.3, 8.4
    """
    name = column_name or series.name or "unknown"

    # Drop nulls for outlier calculation
    non_null = series.drop_nulls()
    total_count = len(non_null)

    # Edge case: empty series or all-null → zero counts
    if total_count == 0:
        return OutlierReport(
            column_name=name,
            q1=0.0,
            q3=0.0,
            iqr=0.0,
            lower_bound=0.0,
            upper_bound=0.0,
            outlier_count=0,
            outlier_percentage=0.0,
            total_count=0,
        )

    # Cast to float for consistent computation
    numeric = non_null.cast(pl.Float64, strict=False)

    # Calculate Q1 and Q3 using Polars quantile (linear interpolation)
    q1 = numeric.quantile(0.25, interpolation="linear")
    q3 = numeric.quantile(0.75, interpolation="linear")

    # Handle potential None returns from quantile
    if q1 is None or q3 is None:
        return OutlierReport(
            column_name=name,
            q1=0.0,
            q3=0.0,
            iqr=0.0,
            lower_bound=0.0,
            upper_bound=0.0,
            outlier_count=0,
            outlier_percentage=0.0,
            total_count=total_count,
        )

    q1_val = float(q1)
    q3_val = float(q3)
    iqr_val = q3_val - q1_val

    lower_bound = q1_val - 1.5 * iqr_val
    upper_bound = q3_val + 1.5 * iqr_val

    # Edge case: IQR = 0 (all same values) → no outliers possible
    # because all values will be between lower_bound and upper_bound (both equal to Q1=Q3)
    if iqr_val == 0.0:
        return OutlierReport(
            column_name=name,
            q1=q1_val,
            q3=q3_val,
            iqr=0.0,
            lower_bound=lower_bound,
            upper_bound=upper_bound,
            outlier_count=0,
            outlier_percentage=0.0,
            total_count=total_count,
        )

    # Count values strictly below lower_bound or strictly above upper_bound
    outlier_mask = (numeric < lower_bound) | (numeric > upper_bound)
    outlier_count = outlier_mask.sum()

    outlier_percentage = (outlier_count / total_count) * 100.0 if total_count > 0 else 0.0

    return OutlierReport(
        column_name=name,
        q1=q1_val,
        q3=q3_val,
        iqr=iqr_val,
        lower_bound=lower_bound,
        upper_bound=upper_bound,
        outlier_count=outlier_count,
        outlier_percentage=round(outlier_percentage, 2),
        total_count=total_count,
    )


def calculate_null_stats(df: pl.DataFrame) -> dict[str, NullStats]:
    """Calculate null count and percentage for each column in a DataFrame.

    For each column, reports the number of null/None/NaN values and the
    null percentage = null_count / total_rows × 100.

    Args:
        df: Polars DataFrame to analyze.

    Returns:
        Dictionary mapping column names to NullStats instances.

    Requirements: 2.4
    """
    total_rows = df.height
    results: dict[str, NullStats] = {}

    for col_name in df.columns:
        null_count = df[col_name].null_count()
        null_percentage = (null_count / total_rows * 100.0) if total_rows > 0 else 0.0

        results[col_name] = NullStats(
            column_name=col_name,
            null_count=null_count,
            null_percentage=round(null_percentage, 10),  # high precision to avoid rounding errors
            total_count=total_rows,
        )

    return results


def find_duplicates(df: pl.DataFrame, id_column: str) -> DuplicateReport:
    """Find duplicate records based on an identifier column.

    A record is considered a duplicate when its identifier value appears more
    than once in the column. The duplication count equals total_records - distinct_identifiers.

    Edge cases:
    - All-null identifier column → 0 duplicates (nulls are not counted as identifiers)
    - Empty DataFrame → 0 duplicates

    Args:
        df: Polars DataFrame to analyze.
        id_column: Name of the identifier column to check for duplicates.

    Returns:
        DuplicateReport with detection results.

    Raises:
        ValueError: If id_column does not exist in the DataFrame.

    Requirements: 2.5, 10.7
    """
    if id_column not in df.columns:
        raise ValueError(f"Column '{id_column}' not found in DataFrame. Available columns: {df.columns}")

    total_records = df.height

    # Edge case: empty DataFrame
    if total_records == 0:
        return DuplicateReport(
            id_column=id_column,
            total_records=0,
            distinct_identifiers=0,
            duplicate_count=0,
            duplication_rate=0.0,
            duplicate_ids=[],
        )

    id_series = df[id_column]

    # Count distinct non-null identifiers
    non_null_ids = id_series.drop_nulls()
    distinct_identifiers = non_null_ids.n_unique()

    # Duplicate count = total_records - distinct_identifiers
    # Null values don't count as valid identifiers, so we consider only non-null records
    # for the duplication logic, but total_records is the full count
    duplicate_count = total_records - distinct_identifiers

    duplication_rate = (duplicate_count / total_records * 100.0) if total_records > 0 else 0.0

    # Find IDs that appear more than once (only non-null values)
    if len(non_null_ids) == 0:
        # All-null identifier column → no duplicates
        return DuplicateReport(
            id_column=id_column,
            total_records=total_records,
            distinct_identifiers=0,
            duplicate_count=total_records,
            duplication_rate=100.0 if total_records > 0 else 0.0,
            duplicate_ids=[],
        )

    # Use value_counts to find identifiers appearing more than once
    value_counts = non_null_ids.value_counts()
    # value_counts returns a DataFrame with columns [id_column, "count"]
    duplicated_df = value_counts.filter(pl.col("count") > 1)
    duplicate_ids = duplicated_df[id_series.name].to_list()

    return DuplicateReport(
        id_column=id_column,
        total_records=total_records,
        distinct_identifiers=distinct_identifiers,
        duplicate_count=duplicate_count,
        duplication_rate=round(duplication_rate, 2),
        duplicate_ids=sorted(duplicate_ids) if duplicate_ids else [],
    )
