"""Type inference and schema detection for data profiling.

Implements column-level type detection using an 80% threshold for classification.
Columns are classified as: categorical, numeric, datetime, boolean, text, or mixed.

Requirements: 2.1, 2.7
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import polars as pl

# Boolean values recognized (case-insensitive)
BOOLEAN_VALUES = frozenset({"true", "false", "yes", "no", "1", "0", "si", "verdadero", "falso"})

# Common date patterns for regex-based detection
_DATE_PATTERNS: list[re.Pattern[str]] = [
    # ISO: 2024-01-15, 2024-01-15T10:30:00
    re.compile(r"^\d{4}-\d{1,2}-\d{1,2}([T ]\d{1,2}:\d{2}(:\d{2})?)?$"),
    # dd/mm/yyyy or dd-mm-yyyy
    re.compile(r"^\d{1,2}[/\-]\d{1,2}[/\-]\d{4}$"),
    # mm/dd/yyyy or mm-dd-yyyy (same pattern, ambiguous with above)
    re.compile(r"^\d{1,2}[/\-]\d{1,2}[/\-]\d{2}$"),
    # dd.mm.yyyy
    re.compile(r"^\d{1,2}\.\d{1,2}\.\d{4}$"),
    # yyyy/mm/dd
    re.compile(r"^\d{4}[/\-]\d{1,2}[/\-]\d{1,2}$"),
]

# Type classification threshold (80%)
TYPE_THRESHOLD = 0.80

# Categorical vs text distinct value threshold
CATEGORICAL_DISTINCT_THRESHOLD = 50


@dataclass
class ColumnTypeInfo:
    """Type inference result for a single column.

    Attributes:
        column_name: Name of the column.
        inferred_type: Detected type: categorical, numeric, datetime, boolean, text, mixed, unknown.
        confidence: Percentage of non-null values matching the inferred type (0-100).
        distinct_count: Number of distinct non-null values in the column.
        type_breakdown: Percentage per detected type. Always populated for mixed;
            summary for others.
    """

    column_name: str
    inferred_type: (
        str  # "categorical", "numeric", "datetime", "boolean", "text", "mixed", "unknown"
    )
    confidence: float  # percentage (0-100)
    distinct_count: int
    type_breakdown: dict[str, float] = field(default_factory=dict)


def _is_boolean(value: str) -> bool:
    """Check if a string value represents a boolean."""
    return value.strip().lower() in BOOLEAN_VALUES


def _is_numeric(value: str) -> bool:
    """Check if a string value can be parsed as a number."""
    try:
        float(value.replace(",", "."))
        return True
    except (ValueError, TypeError):
        return False


def _is_datetime(value: str) -> bool:
    """Check if a string value matches common date/datetime patterns."""
    stripped = value.strip()
    if not stripped:
        return False
    return any(pattern.match(stripped) for pattern in _DATE_PATTERNS)


def _classify_string_values(
    values: list[str],
) -> dict[str, int]:
    """Classify a list of string values into type counts.

    Returns a dict with keys: boolean, numeric, datetime, string
    where 'string' means it didn't match any other specific type.
    """
    counts: dict[str, int] = {
        "boolean": 0,
        "numeric": 0,
        "datetime": 0,
        "string": 0,
    }

    for val in values:
        stripped = val.strip()
        if not stripped:
            # Empty strings treated as not classifiable (excluded from counts)
            continue
        if _is_boolean(stripped):
            counts["boolean"] += 1
        elif _is_numeric(stripped):
            counts["numeric"] += 1
        elif _is_datetime(stripped):
            counts["datetime"] += 1
        else:
            counts["string"] += 1

    return counts


def _infer_column_type(
    series: pl.Series,
    column_name: str,
) -> ColumnTypeInfo:
    """Infer the semantic data type for a single column.

    Detection logic:
    1. If column is already a Polars numeric type → count as numeric
    2. If column is already a Polars Date/Datetime type → count as datetime
    3. If column is already a Polars Boolean type → count as boolean
    4. For string/object columns, examine each non-null value against heuristics
    5. Apply 80% threshold to determine dominant type
    6. For string-like types, distinguish categorical (<50 distinct) from text (≥50 distinct)

    Args:
        series: The Polars Series to analyze.
        column_name: Name of the column.

    Returns:
        ColumnTypeInfo with inferred type and metadata.
    """
    total_values = series.len()
    null_count = series.null_count()
    non_null_count = total_values - null_count

    # Edge case: all-null column → unknown
    if non_null_count == 0:
        return ColumnTypeInfo(
            column_name=column_name,
            inferred_type="unknown",
            confidence=0.0,
            distinct_count=0,
            type_breakdown={},
        )

    # Get distinct count of non-null values
    distinct_count = series.drop_nulls().n_unique()

    dtype = series.dtype

    # If already a native Polars typed column (not String/Utf8)
    if dtype in (pl.Date, pl.Datetime, pl.Time):
        return ColumnTypeInfo(
            column_name=column_name,
            inferred_type="datetime",
            confidence=100.0,
            distinct_count=distinct_count,
            type_breakdown={"datetime": 100.0},
        )

    if dtype == pl.Boolean:
        return ColumnTypeInfo(
            column_name=column_name,
            inferred_type="boolean",
            confidence=100.0,
            distinct_count=distinct_count,
            type_breakdown={"boolean": 100.0},
        )

    if dtype in (
        pl.Int8,
        pl.Int16,
        pl.Int32,
        pl.Int64,
        pl.UInt8,
        pl.UInt16,
        pl.UInt32,
        pl.UInt64,
        pl.Float32,
        pl.Float64,
    ):
        return ColumnTypeInfo(
            column_name=column_name,
            inferred_type="numeric",
            confidence=100.0,
            distinct_count=distinct_count,
            type_breakdown={"numeric": 100.0},
        )

    # For String/Utf8 columns (or Object), inspect values
    # Cast to string for analysis
    str_series = series.cast(pl.Utf8, strict=False).drop_nulls()
    values = str_series.to_list()

    # Filter out empty/whitespace-only strings for classification
    non_empty_values = [v for v in values if v and v.strip()]
    classifiable_count = len(non_empty_values)

    if classifiable_count == 0:
        return ColumnTypeInfo(
            column_name=column_name,
            inferred_type="unknown",
            confidence=0.0,
            distinct_count=distinct_count,
            type_breakdown={},
        )

    # Classify each value
    type_counts = _classify_string_values(non_empty_values)

    # Calculate percentages based on classifiable values
    type_pcts: dict[str, float] = {}
    for type_name, count in type_counts.items():
        pct = (count / classifiable_count) * 100.0
        if pct > 0:
            type_pcts[type_name] = round(pct, 2)

    # Determine dominant type using 80% threshold
    dominant_type: str | None = None
    dominant_pct: float = 0.0

    for type_name, pct in type_pcts.items():
        if pct >= TYPE_THRESHOLD * 100 and pct > dominant_pct:
            dominant_type = type_name
            dominant_pct = pct

    if dominant_type is not None:
        # Single type dominates (≥80%)
        if dominant_type == "string":
            # Distinguish categorical from text based on distinct count
            if distinct_count < CATEGORICAL_DISTINCT_THRESHOLD:
                inferred = "categorical"
            else:
                inferred = "text"
        elif dominant_type == "numeric":
            inferred = "numeric"
        elif dominant_type == "datetime":
            inferred = "datetime"
        elif dominant_type == "boolean":
            inferred = "boolean"
        else:
            inferred = dominant_type

        return ColumnTypeInfo(
            column_name=column_name,
            inferred_type=inferred,
            confidence=round(dominant_pct, 2),
            distinct_count=distinct_count,
            type_breakdown=type_pcts,
        )
    else:
        # No single type reaches 80% → mixed
        return ColumnTypeInfo(
            column_name=column_name,
            inferred_type="mixed",
            confidence=round(max(type_pcts.values()) if type_pcts else 0.0, 2),
            type_breakdown=type_pcts,
            distinct_count=distinct_count,
        )


def infer_types(df: pl.DataFrame) -> dict[str, ColumnTypeInfo]:
    """Infer semantic data types for all columns in a DataFrame.

    For each column, examines non-null values and classifies them using
    type detection heuristics. If a single type accounts for ≥80% of
    non-null values, the column is classified as that type. Otherwise,
    it is classified as "mixed" with a percentage breakdown.

    Categorical vs text distinction: after type detection, string-like
    columns with <50 distinct values are categorical; ≥50 are text.

    Edge cases:
    - All-null columns → "unknown" with 0% confidence
    - Empty DataFrames → empty dict

    Args:
        df: Polars DataFrame to analyze.

    Returns:
        Dictionary mapping column names to ColumnTypeInfo dataclass instances.

    Requirements: 2.1, 2.7
    """
    if df.width == 0 or df.height == 0:
        return {}

    results: dict[str, ColumnTypeInfo] = {}

    for col_name in df.columns:
        series = df[col_name]
        results[col_name] = _infer_column_type(series, col_name)

    return results
