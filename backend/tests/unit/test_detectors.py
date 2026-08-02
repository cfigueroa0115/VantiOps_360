"""Unit tests for profiling detectors: outlier detection, null stats, and duplicate detection.

Tests cover core functionality and edge cases for:
- detect_outliers_iqr: IQR-based outlier detection
- calculate_null_stats: Null count and percentage per column
- find_duplicates: Duplicate detection by identifier column

Requirements: 2.3, 2.4, 2.5
"""

import pytest
import polars as pl

from profiling.detectors import (
    DuplicateReport,
    NullStats,
    OutlierReport,
    calculate_null_stats,
    detect_outliers_iqr,
    find_duplicates,
)


# ============================================================================
# detect_outliers_iqr tests
# ============================================================================


class TestDetectOutliersIQR:
    """Tests for IQR-based outlier detection."""

    def test_basic_outlier_detection(self):
        """Values outside Q1-1.5*IQR and Q3+1.5*IQR are flagged as outliers."""
        # Create a series with known outliers
        # Values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]
        # Q1=3, Q3=9, IQR=6, lower=-6, upper=18 → 100 is an outlier
        data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]
        series = pl.Series("values", data)

        report = detect_outliers_iqr(series)

        assert isinstance(report, OutlierReport)
        assert report.column_name == "values"
        assert report.iqr == report.q3 - report.q1
        assert report.lower_bound == report.q1 - 1.5 * report.iqr
        assert report.upper_bound == report.q3 + 1.5 * report.iqr
        assert report.outlier_count >= 1  # At least 100 is an outlier
        assert report.total_count == 11

    def test_no_outliers_normal_distribution(self):
        """Series with tightly grouped values should have no outliers."""
        # All values are the same → IQR = 0 → no outliers
        series = pl.Series("uniform", [5, 5, 5, 5, 5, 5, 5, 5, 5, 5])

        report = detect_outliers_iqr(series)

        assert report.iqr == 0.0
        assert report.outlier_count == 0
        assert report.outlier_percentage == 0.0

    def test_all_same_values_iqr_zero(self):
        """When all values are identical, IQR=0 and no outliers are reported."""
        series = pl.Series("constant", [42.0] * 100)

        report = detect_outliers_iqr(series)

        assert report.q1 == 42.0
        assert report.q3 == 42.0
        assert report.iqr == 0.0
        assert report.outlier_count == 0
        assert report.total_count == 100

    def test_empty_series(self):
        """Empty series returns zero counts."""
        series = pl.Series("empty", [], dtype=pl.Float64)

        report = detect_outliers_iqr(series)

        assert report.outlier_count == 0
        assert report.total_count == 0
        assert report.outlier_percentage == 0.0

    def test_all_null_series(self):
        """All-null series returns zero counts."""
        series = pl.Series("nulls", [None, None, None], dtype=pl.Float64)

        report = detect_outliers_iqr(series)

        assert report.outlier_count == 0
        assert report.total_count == 0
        assert report.outlier_percentage == 0.0

    def test_nulls_excluded_from_calculation(self):
        """Null values are excluded from outlier calculation."""
        # Include nulls among the values
        data = [1.0, 2.0, 3.0, None, 4.0, 5.0, None, 6.0, 7.0, 8.0, 9.0, 10.0]
        series = pl.Series("with_nulls", data)

        report = detect_outliers_iqr(series)

        # total_count should exclude nulls
        assert report.total_count == 10  # 12 total - 2 nulls

    def test_known_outliers_below_lower_bound(self):
        """Values below Q1-1.5*IQR are detected as outliers."""
        # Build a series where we know the outlier
        # Core: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
        # Add extreme low value: -100
        data = [-100, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
        series = pl.Series("low_outlier", data)

        report = detect_outliers_iqr(series)

        # -100 should definitely be below the lower bound
        assert report.outlier_count >= 1

    def test_custom_column_name(self):
        """Custom column name is used in the report."""
        series = pl.Series("original_name", [1, 2, 3, 4, 5])

        report = detect_outliers_iqr(series, column_name="custom_name")

        assert report.column_name == "custom_name"

    def test_outlier_percentage_calculation(self):
        """Outlier percentage is correctly calculated as (outlier_count / total_count) * 100."""
        # Careful construction: 10 values with exactly 1 outlier
        # [1, 2, 3, 4, 5, 6, 7, 8, 9, 50]
        # Q1=2.75, Q3=8.25, IQR=5.5, lower=-5.5, upper=16.5 → 50 is outlier
        data = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 50.0]
        series = pl.Series("pct_test", data)

        report = detect_outliers_iqr(series)

        # Verify percentage is consistent with count
        if report.total_count > 0:
            expected_pct = round((report.outlier_count / report.total_count) * 100.0, 2)
            assert report.outlier_percentage == expected_pct

    def test_integer_series(self):
        """Works with integer series (auto-cast to float for computation)."""
        series = pl.Series("integers", [1, 2, 3, 4, 5, 6, 7, 8, 9, 1000])

        report = detect_outliers_iqr(series)

        assert report.total_count == 10
        assert report.outlier_count >= 1  # 1000 should be an outlier


# ============================================================================
# calculate_null_stats tests
# ============================================================================


class TestCalculateNullStats:
    """Tests for null statistics calculation."""

    def test_basic_null_counting(self):
        """Correctly counts nulls in each column."""
        df = pl.DataFrame({
            "a": [1, 2, None, 4, None],
            "b": ["x", None, "z", None, None],
            "c": [1.0, 2.0, 3.0, 4.0, 5.0],
        })

        stats = calculate_null_stats(df)

        assert stats["a"].null_count == 2
        assert stats["b"].null_count == 3
        assert stats["c"].null_count == 0

    def test_null_percentage_calculation(self):
        """Null percentage = null_count / total_rows × 100."""
        df = pl.DataFrame({
            "col": [1, None, 3, None, 5, None, 7, None, 9, None],
        })

        stats = calculate_null_stats(df)

        assert stats["col"].null_count == 5
        assert stats["col"].total_count == 10
        # 5/10 * 100 = 50.0
        assert abs(stats["col"].null_percentage - 50.0) < 1e-6

    def test_no_nulls(self):
        """Column with no nulls reports 0 count and 0%."""
        df = pl.DataFrame({"complete": [1, 2, 3, 4, 5]})

        stats = calculate_null_stats(df)

        assert stats["complete"].null_count == 0
        assert stats["complete"].null_percentage == 0.0

    def test_all_nulls(self):
        """Column with all nulls reports 100%."""
        df = pl.DataFrame({"empty": pl.Series([None, None, None], dtype=pl.Int64)})

        stats = calculate_null_stats(df)

        assert stats["empty"].null_count == 3
        assert abs(stats["empty"].null_percentage - 100.0) < 1e-6

    def test_empty_dataframe(self):
        """Empty DataFrame (0 rows) returns stats with 0 counts."""
        df = pl.DataFrame({"col": pl.Series([], dtype=pl.Int64)})

        stats = calculate_null_stats(df)

        assert stats["col"].null_count == 0
        assert stats["col"].null_percentage == 0.0
        assert stats["col"].total_count == 0

    def test_total_count_equals_dataframe_height(self):
        """Total count matches the DataFrame height for all columns."""
        df = pl.DataFrame({
            "a": [1, 2, 3, 4, 5, 6, 7],
            "b": [None, None, "x", "y", None, "z", None],
        })

        stats = calculate_null_stats(df)

        for col_stats in stats.values():
            assert col_stats.total_count == 7

    def test_returns_null_stats_dataclass(self):
        """Return type is dict mapping to NullStats instances."""
        df = pl.DataFrame({"x": [1, 2, 3]})

        stats = calculate_null_stats(df)

        assert isinstance(stats["x"], NullStats)
        assert stats["x"].column_name == "x"

    def test_multiple_columns_independent(self):
        """Each column is analyzed independently."""
        df = pl.DataFrame({
            "full": [1, 2, 3, 4, 5],
            "half": [1, None, 3, None, 5],
            "empty": pl.Series([None, None, None, None, None], dtype=pl.Utf8),
        })

        stats = calculate_null_stats(df)

        assert stats["full"].null_count == 0
        assert stats["half"].null_count == 2
        assert stats["empty"].null_count == 5


# ============================================================================
# find_duplicates tests
# ============================================================================


class TestFindDuplicates:
    """Tests for duplicate detection by identifier column."""

    def test_no_duplicates(self):
        """Dataset with all unique identifiers reports 0 duplicates."""
        df = pl.DataFrame({"id": [1, 2, 3, 4, 5], "data": ["a", "b", "c", "d", "e"]})

        report = find_duplicates(df, "id")

        assert report.total_records == 5
        assert report.distinct_identifiers == 5
        assert report.duplicate_count == 0
        assert report.duplication_rate == 0.0
        assert report.duplicate_ids == []

    def test_with_duplicates(self):
        """Correctly identifies records with repeated identifiers."""
        df = pl.DataFrame({
            "id": [1, 2, 3, 2, 4, 3, 5],
            "data": ["a", "b", "c", "d", "e", "f", "g"],
        })

        report = find_duplicates(df, "id")

        assert report.total_records == 7
        assert report.distinct_identifiers == 5
        # duplicate_count = total - distinct = 7 - 5 = 2
        assert report.duplicate_count == 2
        # IDs appearing more than once: 2 and 3
        assert sorted(report.duplicate_ids) == [2, 3]

    def test_duplication_rate(self):
        """Duplication rate = duplicate_count / total_records × 100."""
        df = pl.DataFrame({"id": [1, 1, 2, 2, 3]})

        report = find_duplicates(df, "id")

        # total=5, distinct=3, dup_count=2, rate=2/5*100=40.0
        assert report.duplicate_count == 2
        assert report.duplication_rate == 40.0

    def test_empty_dataframe(self):
        """Empty DataFrame reports 0 duplicates."""
        df = pl.DataFrame({"id": pl.Series([], dtype=pl.Int64)})

        report = find_duplicates(df, "id")

        assert report.total_records == 0
        assert report.distinct_identifiers == 0
        assert report.duplicate_count == 0
        assert report.duplication_rate == 0.0
        assert report.duplicate_ids == []

    def test_all_null_identifier(self):
        """All-null identifier column reports 0 distinct identifiers."""
        df = pl.DataFrame({"id": pl.Series([None, None, None], dtype=pl.Int64)})

        report = find_duplicates(df, "id")

        assert report.total_records == 3
        assert report.distinct_identifiers == 0
        assert report.duplicate_ids == []

    def test_invalid_column_raises_error(self):
        """Raises ValueError when id_column doesn't exist."""
        df = pl.DataFrame({"id": [1, 2, 3]})

        with pytest.raises(ValueError, match="not found"):
            find_duplicates(df, "nonexistent_column")

    def test_string_identifiers(self):
        """Works with string identifier columns."""
        df = pl.DataFrame({
            "pqr_id": ["PQR001", "PQR002", "PQR001", "PQR003", "PQR002"],
        })

        report = find_duplicates(df, "pqr_id")

        assert report.total_records == 5
        assert report.distinct_identifiers == 3
        assert report.duplicate_count == 2
        assert sorted(report.duplicate_ids) == ["PQR001", "PQR002"]

    def test_single_record(self):
        """Single record has no duplicates."""
        df = pl.DataFrame({"id": [42]})

        report = find_duplicates(df, "id")

        assert report.total_records == 1
        assert report.distinct_identifiers == 1
        assert report.duplicate_count == 0
        assert report.duplicate_ids == []

    def test_all_same_identifier(self):
        """All records with the same ID are all duplicates."""
        df = pl.DataFrame({"id": [1, 1, 1, 1, 1]})

        report = find_duplicates(df, "id")

        assert report.total_records == 5
        assert report.distinct_identifiers == 1
        # duplicate_count = 5 - 1 = 4
        assert report.duplicate_count == 4
        assert report.duplicate_ids == [1]

    def test_returns_duplicate_report_dataclass(self):
        """Return type is DuplicateReport."""
        df = pl.DataFrame({"id": [1, 2, 3]})

        report = find_duplicates(df, "id")

        assert isinstance(report, DuplicateReport)
        assert report.id_column == "id"
