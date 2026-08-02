"""Date validation and semantic similarity detection for data profiling.

Implements date format validation against recognized formats and semantic
similarity grouping of categorical values using Levenshtein distance.

Requirements: 2.2, 2.6
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

import polars as pl


@dataclass
class DateValidationReport:
    """Result of validating date values in a column.

    Attributes:
        column_name: Name of the validated column.
        total_count: Total number of non-null values examined.
        valid_count: Number of values that parsed successfully.
        invalid_count: Number of values that failed all format attempts.
        invalid_percentage: Percentage of invalid values (0-100).
        recognized_formats: List of date format strings that matched at least one value.
        sample_invalid_values: Up to 10 sample values that could not be parsed.
    """

    column_name: str
    total_count: int
    valid_count: int
    invalid_count: int
    invalid_percentage: float
    recognized_formats: list[str] = field(default_factory=list)
    sample_invalid_values: list[str] = field(default_factory=list)


@dataclass
class SimilarityGroup:
    """A group of semantically similar category values.

    Attributes:
        values: List of category strings in this group.
        similarity_score: Average intra-group Levenshtein ratio.
    """

    values: list[str]
    similarity_score: float


# Recognized date formats for strptime parsing
_DATE_FORMATS: list[str] = [
    # ISO formats
    "%Y-%m-%d",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M",
    # dd/mm/yyyy
    "%d/%m/%Y",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    # mm/dd/yyyy
    "%m/%d/%Y",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
    # dd.mm.yyyy
    "%d.%m.%Y",
    "%d.%m.%Y %H:%M:%S",
    # dd-mm-yyyy
    "%d-%m-%Y",
    "%d-%m-%Y %H:%M:%S",
]


def _try_parse_date(value: str) -> str | None:
    """Attempt to parse a date string against all recognized formats.

    Returns the matching format string if successful, None otherwise.
    """
    stripped = value.strip()
    if not stripped:
        return None

    for fmt in _DATE_FORMATS:
        try:
            datetime.strptime(stripped, fmt)
            return fmt
        except ValueError:
            continue
    return None


def validate_dates(series: pl.Series, column_name: str | None = None) -> DateValidationReport:
    """Validate date values in a series against recognized date formats.

    For Polars Date/Datetime columns, all non-null values are valid by definition.
    For string columns, each value is parsed against the format list.

    Args:
        series: The Polars Series to validate.
        column_name: Optional name override; defaults to series name.

    Returns:
        DateValidationReport with counts and percentages of valid/invalid dates.

    Requirements: 2.2
    """
    col_name = column_name or series.name or "unknown"
    dtype = series.dtype

    # For native Date/Datetime columns, all non-null values are valid
    if dtype in (pl.Date, pl.Datetime, pl.Time):
        non_null = series.drop_nulls()
        total = non_null.len()
        return DateValidationReport(
            column_name=col_name,
            total_count=total,
            valid_count=total,
            invalid_count=0,
            invalid_percentage=0.0,
            recognized_formats=["native_polars_datetime"],
            sample_invalid_values=[],
        )

    # For string columns, parse each value against format list
    str_series = series.cast(pl.Utf8, strict=False).drop_nulls()
    values = str_series.to_list()
    total = len(values)

    if total == 0:
        return DateValidationReport(
            column_name=col_name,
            total_count=0,
            valid_count=0,
            invalid_count=0,
            invalid_percentage=0.0,
            recognized_formats=[],
            sample_invalid_values=[],
        )

    valid_count = 0
    invalid_values: list[str] = []
    matched_formats: set[str] = set()

    for val in values:
        fmt = _try_parse_date(val)
        if fmt is not None:
            valid_count += 1
            matched_formats.add(fmt)
        else:
            if len(invalid_values) < 10:
                invalid_values.append(val)

    invalid_count = total - valid_count
    invalid_pct = (invalid_count / total) * 100.0 if total > 0 else 0.0

    return DateValidationReport(
        column_name=col_name,
        total_count=total,
        valid_count=valid_count,
        invalid_count=invalid_count,
        invalid_percentage=round(invalid_pct, 2),
        recognized_formats=sorted(matched_formats),
        sample_invalid_values=invalid_values,
    )


def _levenshtein_distance(s1: str, s2: str) -> int:
    """Compute the Levenshtein (edit) distance between two strings.

    Uses a standard dynamic programming approach with O(min(m,n)) space.

    Args:
        s1: First string.
        s2: Second string.

    Returns:
        Integer edit distance between s1 and s2.
    """
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            # Cost is 0 if characters match, 1 otherwise
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (0 if c1 == c2 else 1)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def levenshtein_ratio(s1: str, s2: str) -> float:
    """Compute the Levenshtein similarity ratio between two strings.

    Ratio = 1 - (levenshtein_distance / max(len(s1), len(s2)))

    Returns 1.0 for identical strings, 0.0 for completely different strings.
    Returns 1.0 if both strings are empty.

    Args:
        s1: First string.
        s2: Second string.

    Returns:
        Float in [0.0, 1.0] representing string similarity.
    """
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return 1.0
    distance = _levenshtein_distance(s1, s2)
    return 1.0 - (distance / max_len)


def find_semantic_similarities(
    categories: list[str],
    threshold: float = 0.85,
) -> list[SimilarityGroup]:
    """Group semantically similar category values using Levenshtein ratio.

    Categories are grouped transitively: if A is similar to B and B is similar
    to C, then {A, B, C} form a group. Only unique category values are considered.

    The threshold is the minimum Levenshtein ratio for two values to be
    considered similar.

    Args:
        categories: List of category string values (duplicates are de-duplicated).
        threshold: Minimum Levenshtein ratio to consider two values similar.
            Default is 0.85.

    Returns:
        List of SimilarityGroup objects, each containing at least 2 values.
        Groups with only 1 value (no similar match found) are excluded.

    Requirements: 2.6
    """
    # De-duplicate while preserving order
    unique_categories = list(dict.fromkeys(categories))

    if len(unique_categories) < 2:
        return []

    # Normalize for comparison (lowercase) but keep original values for output
    normalized = [cat.strip().lower() for cat in unique_categories]

    # Build adjacency: find all pairs with similarity >= threshold
    n = len(unique_categories)
    adjacency: dict[int, set[int]] = {i: set() for i in range(n)}

    for i in range(n):
        for j in range(i + 1, n):
            ratio = levenshtein_ratio(normalized[i], normalized[j])
            if ratio >= threshold:
                adjacency[i].add(j)
                adjacency[j].add(i)

    # Find connected components via BFS (transitive grouping)
    visited: set[int] = set()
    groups: list[SimilarityGroup] = []

    for start in range(n):
        if start in visited:
            continue
        if not adjacency[start]:
            visited.add(start)
            continue

        # BFS to find connected component
        component: list[int] = []
        queue = [start]
        visited.add(start)

        while queue:
            node = queue.pop(0)
            component.append(node)
            for neighbor in adjacency[node]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        if len(component) < 2:
            continue

        # Calculate average intra-group similarity
        pair_scores: list[float] = []
        for i_idx in range(len(component)):
            for j_idx in range(i_idx + 1, len(component)):
                score = levenshtein_ratio(
                    normalized[component[i_idx]], normalized[component[j_idx]]
                )
                pair_scores.append(score)

        avg_score = sum(pair_scores) / len(pair_scores) if pair_scores else 0.0

        group_values = [unique_categories[idx] for idx in component]
        groups.append(
            SimilarityGroup(
                values=group_values,
                similarity_score=round(avg_score, 4),
            )
        )

    return groups
