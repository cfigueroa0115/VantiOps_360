"""Property-based tests for descriptive statistics and MIN_GROUP_SIZE privacy exclusion.

**Validates: Requirements 9.1, 9.3, 38.2**

Property 9: Descriptive statistics correctness
- P9a: For any non-empty numeric series, mean is always between min and max
- P9b: Median is always between min and max
- P9c: P90 >= P50 (median) and P95 >= P90
- P9d: stddev is always >= 0
- P9e: For a constant series, stddev == 0

Property 10: MIN_GROUP_SIZE privacy exclusion
- P10a: grouped_descriptive_stats excludes groups with < 5 records
- P10b: grouped_descriptive_stats includes groups with >= 5 records
- P10c: grouped_shapiro_wilk excludes groups with < 5 records
- P10d: grouped_mean_ci excludes groups with < 5 records
"""

from __future__ import annotations

from statistics.descriptive import (
    MIN_GROUP_SIZE,
    descriptive_stats,
    grouped_descriptive_stats,
)
from statistics.inference import (
    grouped_mean_ci,
    grouped_shapiro_wilk,
)

import polars as pl
from hypothesis import assume, given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------


@st.composite
def numeric_series(draw: st.DrawFn, min_size: int = 1, max_size: int = 100) -> pl.Series:
    """Generate a non-empty Polars numeric series with finite values."""
    n = draw(st.integers(min_value=min_size, max_value=max_size))
    values = draw(
        st.lists(
            st.floats(min_value=-1e6, max_value=1e6, allow_nan=False, allow_infinity=False),
            min_size=n,
            max_size=n,
        )
    )
    return pl.Series("value", values)


@st.composite
def constant_series(draw: st.DrawFn) -> pl.Series:
    """Generate a Polars series where all values are identical."""
    n = draw(st.integers(min_value=2, max_value=50))
    value = draw(st.floats(min_value=-1e6, max_value=1e6, allow_nan=False, allow_infinity=False))
    return pl.Series("value", [value] * n)


@st.composite
def grouped_dataframe(draw: st.DrawFn) -> tuple[pl.DataFrame, list[str], list[str]]:
    """Generate a DataFrame with a numeric column and a group column.

    Returns (df, small_groups, large_groups) where small_groups have < MIN_GROUP_SIZE
    records and large_groups have >= MIN_GROUP_SIZE records.
    """
    # Generate between 2-5 groups
    n_groups = draw(st.integers(min_value=2, max_value=5))

    all_values: list[float] = []
    all_groups: list[str] = []
    small_groups: list[str] = []
    large_groups: list[str] = []

    for i in range(n_groups):
        group_name = f"group_{i}"
        # Decide if this group is small (< MIN_GROUP_SIZE) or large (>= MIN_GROUP_SIZE)
        is_small = draw(st.booleans())

        if is_small:
            size = draw(st.integers(min_value=1, max_value=MIN_GROUP_SIZE - 1))
            small_groups.append(group_name)
        else:
            size = draw(st.integers(min_value=MIN_GROUP_SIZE, max_value=30))
            large_groups.append(group_name)

        values = draw(
            st.lists(
                st.floats(min_value=-1e4, max_value=1e4, allow_nan=False, allow_infinity=False),
                min_size=size,
                max_size=size,
            )
        )
        all_values.extend(values)
        all_groups.extend([group_name] * size)

    df = pl.DataFrame({"value": all_values, "group": all_groups})
    return df, small_groups, large_groups


# ---------------------------------------------------------------------------
# Property 9a: Mean is always between min and max
# ---------------------------------------------------------------------------


@given(series=numeric_series(min_size=1))
@settings(max_examples=200, deadline=None)
def test_p9a_mean_between_min_and_max(series: pl.Series) -> None:
    """P9a: For any non-empty numeric series, mean is always between min and max.

    Note: descriptive_stats rounds to 2 decimal places, so we allow a small
    tolerance (0.005) to account for rounding effects at boundaries.

    **Validates: Requirements 9.1**
    """
    stats = descriptive_stats(series)
    min_val = float(series.min())  # type: ignore[arg-type]
    max_val = float(series.max())  # type: ignore[arg-type]

    # Allow rounding tolerance of 0.005 (half of the last rounded digit)
    assert min_val - 0.005 <= stats.mean <= max_val + 0.005


# ---------------------------------------------------------------------------
# Property 9b: Median is always between min and max
# ---------------------------------------------------------------------------


@given(series=numeric_series(min_size=1))
@settings(max_examples=200, deadline=None)
def test_p9b_median_between_min_and_max(series: pl.Series) -> None:
    """P9b: For any non-empty numeric series, median is always between min and max.

    Note: descriptive_stats rounds to 2 decimal places, so we allow a small
    tolerance (0.005) to account for rounding effects at boundaries.

    **Validates: Requirements 9.1**
    """
    stats = descriptive_stats(series)
    min_val = float(series.min())  # type: ignore[arg-type]
    max_val = float(series.max())  # type: ignore[arg-type]

    # Allow rounding tolerance of 0.005 (half of the last rounded digit)
    assert min_val - 0.005 <= stats.median <= max_val + 0.005


# ---------------------------------------------------------------------------
# Property 9c: P90 >= P50 (median) and P95 >= P90
# ---------------------------------------------------------------------------


@given(series=numeric_series(min_size=2))
@settings(max_examples=200, deadline=None)
def test_p9c_percentile_ordering(series: pl.Series) -> None:
    """P9c: P90 >= P50 (median) and P95 >= P90.

    **Validates: Requirements 9.1**
    """
    stats = descriptive_stats(series)

    assert stats.p90 >= stats.median
    assert stats.p95 >= stats.p90


# ---------------------------------------------------------------------------
# Property 9d: stddev is always >= 0
# ---------------------------------------------------------------------------


@given(series=numeric_series(min_size=1))
@settings(max_examples=200, deadline=None)
def test_p9d_stddev_non_negative(series: pl.Series) -> None:
    """P9d: Standard deviation is always >= 0.

    **Validates: Requirements 9.1**
    """
    stats = descriptive_stats(series)

    assert stats.std >= 0.0


# ---------------------------------------------------------------------------
# Property 9e: For a constant series, stddev == 0
# ---------------------------------------------------------------------------


@given(series=constant_series())
@settings(max_examples=200, deadline=None)
def test_p9e_constant_series_stddev_zero(series: pl.Series) -> None:
    """P9e: For a constant series (all identical values), stddev == 0.

    **Validates: Requirements 9.1**
    """
    stats = descriptive_stats(series)

    assert stats.std == 0.0


# ---------------------------------------------------------------------------
# Property 10a: grouped_descriptive_stats excludes groups with < 5 records
# ---------------------------------------------------------------------------


@given(data=grouped_dataframe())
@settings(max_examples=100, deadline=None)
def test_p10a_grouped_stats_excludes_small_groups(
    data: tuple[pl.DataFrame, list[str], list[str]],
) -> None:
    """P10a: grouped_descriptive_stats excludes groups with < MIN_GROUP_SIZE records.

    **Validates: Requirements 9.3**
    """
    df, small_groups, large_groups = data
    assume(len(small_groups) > 0)

    results = grouped_descriptive_stats(df, value_col="value", group_col="group")

    for group_name in small_groups:
        assert group_name not in results


# ---------------------------------------------------------------------------
# Property 10b: grouped_descriptive_stats includes groups with >= 5 records
# ---------------------------------------------------------------------------


@given(data=grouped_dataframe())
@settings(max_examples=100, deadline=None)
def test_p10b_grouped_stats_includes_large_groups(
    data: tuple[pl.DataFrame, list[str], list[str]],
) -> None:
    """P10b: grouped_descriptive_stats includes groups with >= MIN_GROUP_SIZE records.

    **Validates: Requirements 9.3**
    """
    df, small_groups, large_groups = data
    assume(len(large_groups) > 0)

    results = grouped_descriptive_stats(df, value_col="value", group_col="group")

    for group_name in large_groups:
        assert group_name in results


# ---------------------------------------------------------------------------
# Property 10c: grouped_shapiro_wilk excludes groups with < 5 records
# ---------------------------------------------------------------------------


@given(data=grouped_dataframe())
@settings(max_examples=100, deadline=None)
def test_p10c_grouped_shapiro_excludes_small_groups(
    data: tuple[pl.DataFrame, list[str], list[str]],
) -> None:
    """P10c: grouped_shapiro_wilk excludes groups with < MIN_GROUP_SIZE records.

    **Validates: Requirements 9.3**
    """
    df, small_groups, large_groups = data
    assume(len(small_groups) > 0)

    results = grouped_shapiro_wilk(df, value_col="value", group_col="group")

    for group_name in small_groups:
        assert group_name not in results


# ---------------------------------------------------------------------------
# Property 10d: grouped_mean_ci excludes groups with < 5 records
# ---------------------------------------------------------------------------


@given(data=grouped_dataframe())
@settings(max_examples=100, deadline=None)
def test_p10d_grouped_mean_ci_excludes_small_groups(
    data: tuple[pl.DataFrame, list[str], list[str]],
) -> None:
    """P10d: grouped_mean_ci excludes groups with < MIN_GROUP_SIZE records.

    **Validates: Requirements 9.3**
    """
    df, small_groups, large_groups = data
    assume(len(small_groups) > 0)

    results = grouped_mean_ci(df, value_col="value", group_col="group")

    for group_name in small_groups:
        assert group_name not in results
