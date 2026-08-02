"""Unit tests for statistics.descriptive module.

Tests descriptive_stats() and conditional_probability() functions
including edge cases, null handling, and low confidence flagging.
"""

from __future__ import annotations

import polars as pl
import pytest

from statistics.descriptive import (
    ConditionalProbResult,
    DescriptiveStats,
    conditional_probability,
    descriptive_stats,
)


class TestDescriptiveStats:
    """Tests for descriptive_stats function."""

    def test_basic_statistics(self):
        """Verify mean, median, mode, variance, std for a known series."""
        # Values: 1, 2, 3, 4, 5, 5
        series = pl.Series("values", [1.0, 2.0, 3.0, 4.0, 5.0, 5.0])
        result = descriptive_stats(series)

        assert isinstance(result, DescriptiveStats)
        assert result.count == 6
        # mean = (1+2+3+4+5+5)/6 = 20/6 ≈ 3.33
        assert result.mean == pytest.approx(3.33, abs=0.01)
        # median of [1,2,3,4,5,5] = (3+4)/2 = 3.5
        assert result.median == pytest.approx(3.5, abs=0.01)
        # mode = 5 (appears twice)
        assert result.mode == 5.0

    def test_quartiles_and_percentiles(self):
        """Verify Q1, Q2, Q3, P90, P95, IQR computation."""
        # Use a dataset with known percentiles
        series = pl.Series("time", list(range(1, 101)))  # 1 to 100
        result = descriptive_stats(series)

        assert result.q1 == pytest.approx(25.75, abs=0.5)
        assert result.q2 == pytest.approx(50.5, abs=0.5)
        assert result.q3 == pytest.approx(75.25, abs=0.5)
        assert result.p90 == pytest.approx(90.1, abs=1.0)
        assert result.p95 == pytest.approx(95.05, abs=1.0)
        assert result.iqr == pytest.approx(49.5, abs=1.0)

    def test_all_values_rounded_to_two_decimals(self):
        """All numeric outputs must be rounded to 2 decimal places."""
        series = pl.Series("vals", [1.111, 2.222, 3.333, 4.444, 5.555])
        result = descriptive_stats(series)

        # Check that values have at most 2 decimal places
        def has_max_2_decimals(val: float) -> bool:
            return round(val, 2) == val

        assert has_max_2_decimals(result.mean)
        assert has_max_2_decimals(result.median)
        if result.mode is not None:
            assert has_max_2_decimals(result.mode)
        assert has_max_2_decimals(result.variance)
        assert has_max_2_decimals(result.std)
        assert has_max_2_decimals(result.q1)
        assert has_max_2_decimals(result.q2)
        assert has_max_2_decimals(result.q3)
        assert has_max_2_decimals(result.p90)
        assert has_max_2_decimals(result.p95)
        assert has_max_2_decimals(result.iqr)

    def test_null_values_excluded(self):
        """Null values should be excluded from all calculations."""
        series = pl.Series("vals", [1.0, 2.0, None, 4.0, 5.0])
        result = descriptive_stats(series)

        # Only 4 non-null values
        assert result.count == 4
        # mean = (1+2+4+5)/4 = 3.0
        assert result.mean == 3.0

    def test_empty_series(self):
        """Empty series should return zero defaults."""
        series = pl.Series("empty", [], dtype=pl.Float64)
        result = descriptive_stats(series)

        assert result.count == 0
        assert result.mean == 0.0
        assert result.median == 0.0
        assert result.mode is None
        assert result.variance == 0.0
        assert result.std == 0.0
        assert result.outlier_count == 0

    def test_all_null_series(self):
        """All-null series should return zero defaults."""
        series = pl.Series("nulls", [None, None, None], dtype=pl.Float64)
        result = descriptive_stats(series)

        assert result.count == 0
        assert result.mean == 0.0

    def test_single_value(self):
        """Single value series should have zero variance and std."""
        series = pl.Series("single", [42.0])
        result = descriptive_stats(series)

        assert result.count == 1
        assert result.mean == 42.0
        assert result.median == 42.0
        assert result.mode == 42.0
        assert result.variance == 0.0
        assert result.std == 0.0
        assert result.iqr == 0.0

    def test_outlier_detection(self):
        """Outliers detected using IQR method (values > Q3+1.5*IQR or < Q1-1.5*IQR)."""
        # Create a series with clear outliers
        normal_vals = [10.0] * 50 + [20.0] * 50
        outlier_vals = [100.0, 200.0]  # clearly outside IQR bounds
        series = pl.Series("with_outliers", normal_vals + outlier_vals)
        result = descriptive_stats(series)

        assert result.outlier_count >= 2
        assert result.outlier_percentage > 0.0

    def test_constant_series_no_outliers(self):
        """Series with all same values should have zero outliers (IQR = 0)."""
        series = pl.Series("constant", [5.0] * 100)
        result = descriptive_stats(series)

        assert result.iqr == 0.0
        assert result.outlier_count == 0
        assert result.outlier_percentage == 0.0


class TestConditionalProbability:
    """Tests for conditional_probability function."""

    def _build_sample_df(self) -> pl.DataFrame:
        """Build a sample DataFrame for testing."""
        return pl.DataFrame(
            {
                "cause": ["A"] * 40 + ["B"] * 35 + ["C"] * 25,
                "time": [5.0] * 30 + [15.0] * 10 + [5.0] * 25 + [15.0] * 10 + [5.0] * 20 + [15.0] * 5,
                "channel": ["phone"] * 50 + ["web"] * 30 + ["email"] * 20,
            }
        )

    def test_basic_conditional_probability(self):
        """P(time > 10 | cause) should return correct probabilities per group."""
        df = self._build_sample_df()

        def time_above_10(frame: pl.DataFrame) -> pl.Series:
            return frame["time"] > 10.0

        results = conditional_probability(df, "time", time_above_10, "cause")

        assert "A" in results
        assert "B" in results
        assert "C" in results

        # cause A: 40 records, 10 with time>10 → P=0.25
        assert results["A"].probability == pytest.approx(0.25, abs=0.01)
        assert results["A"].sample_size == 40

        # cause B: 35 records, 10 with time>10 → P≈0.2857
        assert results["B"].probability == pytest.approx(0.2857, abs=0.01)

        # cause C: 25 records, 5 with time>10 → P=0.2
        assert results["C"].probability == pytest.approx(0.2, abs=0.01)

    def test_null_exclusion_in_group_col(self):
        """Records with null in group_col should be excluded (Req 8.9)."""
        df = pl.DataFrame(
            {
                "cause": ["A", "A", "B", None, None, "B"],
                "time": [15.0, 5.0, 15.0, 15.0, 5.0, 5.0],
            }
        )

        def time_above_10(frame: pl.DataFrame) -> pl.Series:
            return frame["time"] > 10.0

        results = conditional_probability(df, "time", time_above_10, "cause")

        # 2 nulls excluded
        assert results["A"].excluded_null_count == 2
        assert results["B"].excluded_null_count == 2

        # A: 2 records (null excluded), 1 with time>10 → P=0.5
        assert results["A"].sample_size == 2
        assert results["A"].probability == 0.5

        # B: 2 records, 1 with time>10 → P=0.5
        assert results["B"].sample_size == 2
        assert results["B"].probability == 0.5

    def test_low_confidence_flagging(self):
        """Groups with fewer than 30 records should be flagged as low confidence."""
        df = pl.DataFrame(
            {
                "cause": ["A"] * 10 + ["B"] * 50,
                "time": [15.0] * 5 + [5.0] * 5 + [15.0] * 25 + [5.0] * 25,
            }
        )

        def time_above_10(frame: pl.DataFrame) -> pl.Series:
            return frame["time"] > 10.0

        results = conditional_probability(df, "time", time_above_10, "cause")

        # A has 10 records → low confidence
        assert results["A"].is_low_confidence is True
        assert results["A"].sample_size == 10

        # B has 50 records → not low confidence
        assert results["B"].is_low_confidence is False
        assert results["B"].sample_size == 50

    def test_empty_dataframe(self):
        """Empty DataFrame should return empty results."""
        df = pl.DataFrame(
            {"cause": pl.Series([], dtype=pl.Utf8), "time": pl.Series([], dtype=pl.Float64)}
        )

        def time_above_10(frame: pl.DataFrame) -> pl.Series:
            return frame["time"] > 10.0

        results = conditional_probability(df, "time", time_above_10, "cause")
        assert results == {}

    def test_all_null_group_col(self):
        """All-null group column should return empty results (all excluded)."""
        df = pl.DataFrame(
            {"cause": [None, None, None], "time": [5.0, 10.0, 15.0]}
        )

        def time_above_10(frame: pl.DataFrame) -> pl.Series:
            return frame["time"] > 10.0

        results = conditional_probability(df, "time", time_above_10, "cause")
        assert results == {}

    def test_result_dataclass_fields(self):
        """Verify all fields present in ConditionalProbResult."""
        df = pl.DataFrame(
            {
                "cause": ["X"] * 5,
                "time": [15.0, 5.0, 15.0, 5.0, 15.0],
            }
        )

        def time_above_10(frame: pl.DataFrame) -> pl.Series:
            return frame["time"] > 10.0

        results = conditional_probability(df, "time", time_above_10, "cause")
        result = results["X"]

        assert isinstance(result, ConditionalProbResult)
        assert result.group_value == "X"
        assert result.probability == 0.6
        assert result.sample_size == 5
        assert result.is_low_confidence is True
        assert result.excluded_null_count == 0

    def test_probability_bounds(self):
        """Probability should always be between 0 and 1."""
        df = pl.DataFrame(
            {
                "cause": ["A"] * 50 + ["B"] * 50,
                "time": [15.0] * 50 + [5.0] * 50,
            }
        )

        def time_above_10(frame: pl.DataFrame) -> pl.Series:
            return frame["time"] > 10.0

        results = conditional_probability(df, "time", time_above_10, "cause")

        # All time>10 for A → P=1.0
        assert results["A"].probability == 1.0
        # No time>10 for B → P=0.0
        assert results["B"].probability == 0.0
