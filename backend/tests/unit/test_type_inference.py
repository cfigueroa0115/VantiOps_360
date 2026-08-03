"""Unit tests for type inference and schema detection.

Tests the infer_types() function and supporting utilities for correct
classification of columns using the 80% threshold rule.

Requirements: 2.1, 2.7
"""

from __future__ import annotations

import polars as pl

from profiling.type_inference import (
    BOOLEAN_VALUES,
    ColumnTypeInfo,
    _is_boolean,
    _is_datetime,
    _is_numeric,
    infer_types,
)


class TestHelperFunctions:
    """Tests for individual type detection helper functions."""

    def test_is_boolean_recognizes_all_values(self) -> None:
        """All defined boolean values should be recognized."""
        for val in BOOLEAN_VALUES:
            assert _is_boolean(val), f"Expected '{val}' to be boolean"
            assert _is_boolean(val.upper()), f"Expected '{val.upper()}' to be boolean"

    def test_is_boolean_rejects_non_boolean(self) -> None:
        assert not _is_boolean("maybe")
        assert not _is_boolean("2")
        assert not _is_boolean("hello")

    def test_is_numeric_integers(self) -> None:
        assert _is_numeric("42")
        assert _is_numeric("-7")
        assert _is_numeric("0")

    def test_is_numeric_floats(self) -> None:
        assert _is_numeric("3.14")
        assert _is_numeric("-0.5")
        assert _is_numeric("1,5")  # comma as decimal separator

    def test_is_numeric_rejects_non_numeric(self) -> None:
        assert not _is_numeric("abc")
        assert not _is_numeric("12abc")
        assert not _is_numeric("")

    def test_is_datetime_iso_format(self) -> None:
        assert _is_datetime("2024-01-15")
        assert _is_datetime("2024-01-15T10:30:00")
        assert _is_datetime("2024-1-5")

    def test_is_datetime_slash_format(self) -> None:
        assert _is_datetime("15/01/2024")
        assert _is_datetime("1/5/2024")

    def test_is_datetime_dot_format(self) -> None:
        assert _is_datetime("15.01.2024")

    def test_is_datetime_rejects_non_dates(self) -> None:
        assert not _is_datetime("hello")
        assert not _is_datetime("12345")
        assert not _is_datetime("")


class TestInferTypesEdgeCases:
    """Tests for edge cases in infer_types."""

    def test_empty_dataframe_returns_empty_dict(self) -> None:
        """Empty DataFrames → return empty dict."""
        df = pl.DataFrame()
        result = infer_types(df)
        assert result == {}

    def test_zero_rows_returns_empty_dict(self) -> None:
        """DataFrame with columns but zero rows → return empty dict."""
        df = pl.DataFrame({"a": [], "b": []}).cast({"a": pl.Utf8, "b": pl.Int64})
        result = infer_types(df)
        assert result == {}

    def test_all_null_column_classified_as_unknown(self) -> None:
        """All-null columns → classify as 'unknown' with 0% confidence."""
        df = pl.DataFrame({"col": [None, None, None]})
        result = infer_types(df)
        assert result["col"].inferred_type == "unknown"
        assert result["col"].confidence == 0.0
        assert result["col"].distinct_count == 0


class TestInferTypesNumeric:
    """Tests for numeric type inference."""

    def test_native_int_column(self) -> None:
        """Polars integer column → numeric with 100% confidence."""
        df = pl.DataFrame({"val": [1, 2, 3, 4, 5]})
        result = infer_types(df)
        assert result["val"].inferred_type == "numeric"
        assert result["val"].confidence == 100.0

    def test_native_float_column(self) -> None:
        """Polars float column → numeric with 100% confidence."""
        df = pl.DataFrame({"val": [1.1, 2.2, 3.3]})
        result = infer_types(df)
        assert result["val"].inferred_type == "numeric"
        assert result["val"].confidence == 100.0

    def test_string_numeric_column_above_threshold(self) -> None:
        """String column with ≥80% numeric values → numeric."""
        # 9 numeric values out of 10 = 90%
        values = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "abc"]
        df = pl.DataFrame({"val": values})
        result = infer_types(df)
        assert result["val"].inferred_type == "numeric"
        assert result["val"].confidence >= 80.0


class TestInferTypesDatetime:
    """Tests for datetime type inference."""

    def test_native_date_column(self) -> None:
        """Polars Date column → datetime with 100% confidence."""
        from datetime import date

        df = pl.DataFrame({"dt": [date(2024, 1, 1), date(2024, 2, 1)]})
        result = infer_types(df)
        assert result["dt"].inferred_type == "datetime"
        assert result["dt"].confidence == 100.0

    def test_native_datetime_column(self) -> None:
        """Polars Datetime column → datetime with 100% confidence."""
        from datetime import datetime

        df = pl.DataFrame({"dt": [datetime(2024, 1, 1, 10, 0), datetime(2024, 2, 1, 12, 0)]})
        result = infer_types(df)
        assert result["dt"].inferred_type == "datetime"
        assert result["dt"].confidence == 100.0

    def test_string_date_column_above_threshold(self) -> None:
        """String column with ≥80% date values → datetime."""
        # 9 dates + 1 non-date = 90%
        values = [
            "2024-01-01",
            "2024-01-02",
            "2024-01-03",
            "2024-01-04",
            "2024-01-05",
            "2024-01-06",
            "2024-01-07",
            "2024-01-08",
            "2024-01-09",
            "not_a_date",
        ]
        df = pl.DataFrame({"dt": values})
        result = infer_types(df)
        assert result["dt"].inferred_type == "datetime"
        assert result["dt"].confidence >= 80.0


class TestInferTypesBoolean:
    """Tests for boolean type inference."""

    def test_native_boolean_column(self) -> None:
        """Polars Boolean column → boolean with 100% confidence."""
        df = pl.DataFrame({"flag": [True, False, True]})
        result = infer_types(df)
        assert result["flag"].inferred_type == "boolean"
        assert result["flag"].confidence == 100.0

    def test_string_boolean_column_above_threshold(self) -> None:
        """String column with ≥80% boolean values → boolean."""
        # 9 boolean + 1 non-boolean = 90%
        values = ["true", "false", "yes", "no", "si", "verdadero", "falso", "1", "0", "maybe"]
        df = pl.DataFrame({"flag": values})
        result = infer_types(df)
        assert result["flag"].inferred_type == "boolean"
        assert result["flag"].confidence >= 80.0


class TestInferTypesCategorical:
    """Tests for categorical type inference."""

    def test_string_column_few_distinct_values(self) -> None:
        """String column with <50 distinct values → categorical."""
        # 5 categories repeated = definitely <50 distinct
        values = ["cat_a", "cat_b", "cat_c", "cat_d", "cat_e"] * 10
        df = pl.DataFrame({"category": values})
        result = infer_types(df)
        assert result["category"].inferred_type == "categorical"
        assert result["category"].distinct_count < 50


class TestInferTypesText:
    """Tests for text type inference."""

    def test_string_column_many_distinct_values(self) -> None:
        """String column with ≥50 distinct values → text."""
        values = [f"unique_text_{i}" for i in range(60)]
        df = pl.DataFrame({"description": values})
        result = infer_types(df)
        assert result["description"].inferred_type == "text"
        assert result["description"].distinct_count >= 50


class TestInferTypesMixed:
    """Tests for mixed type inference."""

    def test_mixed_type_no_dominant(self) -> None:
        """Column with no single type ≥80% → mixed with breakdown."""
        # 4 numeric, 3 dates, 3 text = no type reaches 80%
        values = [
            "1",
            "2",
            "3",
            "4",
            "2024-01-01",
            "2024-01-02",
            "2024-01-03",
            "hello",
            "world",
            "foo",
        ]
        df = pl.DataFrame({"mixed": values})
        result = infer_types(df)
        assert result["mixed"].inferred_type == "mixed"
        assert result["mixed"].type_breakdown != {}
        # All detected types should have percentages
        total_pct = sum(result["mixed"].type_breakdown.values())
        assert abs(total_pct - 100.0) < 0.1

    def test_mixed_type_reports_all_detected_types(self) -> None:
        """Mixed column should report percentage for each detected type."""
        # 5 numeric, 3 boolean, 2 text = 50%, 30%, 20%
        values = ["1", "2", "3", "4", "5", "true", "false", "yes", "hello", "world"]
        df = pl.DataFrame({"mixed": values})
        result = infer_types(df)
        assert result["mixed"].inferred_type == "mixed"
        assert "numeric" in result["mixed"].type_breakdown
        assert "boolean" in result["mixed"].type_breakdown
        assert "string" in result["mixed"].type_breakdown


class TestInferTypesMultiColumn:
    """Tests for DataFrames with multiple columns of different types."""

    def test_multi_column_detection(self) -> None:
        """Multiple columns with different types detected correctly."""
        df = pl.DataFrame(
            {
                "id": [1, 2, 3, 4, 5],
                "name": ["Alice", "Bob", "Charlie", "David", "Eve"],
                "active": [True, False, True, True, False],
            }
        )
        result = infer_types(df)
        assert result["id"].inferred_type == "numeric"
        assert result["name"].inferred_type == "categorical"
        assert result["active"].inferred_type == "boolean"

    def test_column_type_info_structure(self) -> None:
        """Returned ColumnTypeInfo has all expected fields."""
        df = pl.DataFrame({"x": [1, 2, 3]})
        result = infer_types(df)
        info = result["x"]
        assert isinstance(info, ColumnTypeInfo)
        assert info.column_name == "x"
        assert info.inferred_type == "numeric"
        assert info.confidence == 100.0
        assert info.distinct_count == 3
        assert isinstance(info.type_breakdown, dict)


class TestThresholdBoundary:
    """Tests for the exact 80% threshold boundary."""

    def test_exactly_80_percent_classified(self) -> None:
        """Column with exactly 80% of one type → classified as that type."""
        # Use values that are unambiguously numeric (avoid "0", "1" which match boolean)
        # 80 numeric + 20 text = exactly 80%
        values = [str(i) for i in range(2, 82)] + [f"text_{i}" for i in range(20)]
        df = pl.DataFrame({"val": values})
        result = infer_types(df)
        assert result["val"].inferred_type == "numeric"
        assert result["val"].confidence >= 80.0

    def test_just_below_80_percent_mixed(self) -> None:
        """Column with 79% of one type → classified as mixed."""
        # 79 numeric + 21 text = 79% numeric
        values = [str(i) for i in range(79)] + [f"text_{i}" for i in range(21)]
        df = pl.DataFrame({"val": values})
        result = infer_types(df)
        assert result["val"].inferred_type == "mixed"

    def test_nulls_excluded_from_threshold_calculation(self) -> None:
        """Nulls should not count toward or against the threshold."""
        # 8 numeric + 2 text + 5 nulls = 8/10 non-null = 80% numeric
        # Use values >=2 to avoid "0","1" being classified as boolean
        values = ["2", "3", "4", "5", "6", "7", "8", "9", "hello", "world"]
        null_values: list[str | None] = values + [None, None, None, None, None]
        df = pl.DataFrame({"val": null_values})
        result = infer_types(df)
        assert result["val"].inferred_type == "numeric"
        assert result["val"].confidence >= 80.0
