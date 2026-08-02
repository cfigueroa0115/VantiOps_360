"""Unit tests for statistics.inference module.

Tests Pareto analysis, Wilson confidence interval, chi-square test,
and two-proportion z-test implementations.
"""

import re

import polars as pl
import pytest

from statistics.inference import (
    ParetoResult,
    TestResult,
    chi_square_test,
    pareto_analysis,
    two_proportion_z_test,
    wilson_confidence_interval,
)


# ---------------------------------------------------------------------------
# Pareto Analysis Tests
# ---------------------------------------------------------------------------


class TestParetoAnalysis:
    """Tests for pareto_analysis()."""

    def test_basic_pareto_80_percent(self):
        """Minimum set of categories that accounts for ≥80% of volume."""
        # 5 categories: A=50, B=25, C=15, D=7, E=3 → total=100
        # A alone = 50% (not enough)
        # A+B = 75% (not enough)
        # A+B+C = 90% (enough!) → minimum set is [A, B, C]
        df = pl.DataFrame(
            {"cause": ["A"] * 50 + ["B"] * 25 + ["C"] * 15 + ["D"] * 7 + ["E"] * 3}
        )
        result = pareto_analysis(df, "cause")

        assert isinstance(result, ParetoResult)
        assert result.categories == ["A", "B", "C"]
        assert result.frequencies == [50, 25, 15]
        assert result.total_count == 100
        assert result.cumulative_percentages[-1] >= 0.80
        assert result.pareto_threshold == 0.80

    def test_single_category_above_80(self):
        """When one category alone accounts for ≥80%, only it is returned."""
        df = pl.DataFrame({"cat": ["X"] * 85 + ["Y"] * 10 + ["Z"] * 5})
        result = pareto_analysis(df, "cat")

        assert result.categories == ["X"]
        assert result.frequencies == [85]
        assert result.cumulative_percentages[0] == 0.85
        assert result.total_count == 100

    def test_descending_order(self):
        """Categories are returned in descending order of frequency."""
        df = pl.DataFrame({"item": ["C"] * 10 + ["A"] * 40 + ["B"] * 30 + ["D"] * 20})
        result = pareto_analysis(df, "item")

        # Frequencies should be descending
        for i in range(len(result.frequencies) - 1):
            assert result.frequencies[i] >= result.frequencies[i + 1]

    def test_minimum_set_property(self):
        """Removing any category from the set drops cumulative below 80%."""
        df = pl.DataFrame(
            {"cause": ["A"] * 40 + ["B"] * 30 + ["C"] * 20 + ["D"] * 10}
        )
        result = pareto_analysis(df, "cause")

        # The result must hit ≥80%
        assert result.cumulative_percentages[-1] >= 0.80

        # If we have more than 1 category, removing the last should drop below 80%
        if len(result.categories) > 1:
            cum_without_last = sum(result.frequencies[:-1]) / result.total_count
            assert cum_without_last < 0.80

    def test_empty_dataframe(self):
        """Empty DataFrame returns empty result."""
        df = pl.DataFrame({"col": []}).cast({"col": pl.Utf8})
        result = pareto_analysis(df, "col")

        assert result.categories == []
        assert result.frequencies == []
        assert result.cumulative_percentages == []
        assert result.total_count == 0

    def test_null_values_excluded(self):
        """Null values in the column are excluded from Pareto analysis."""
        df = pl.DataFrame({"x": ["A"] * 60 + ["B"] * 20 + [None] * 20})
        result = pareto_analysis(df, "x")

        assert result.total_count == 80  # nulls excluded
        assert "A" in result.categories

    def test_cumulative_percentages_are_increasing(self):
        """Cumulative percentages are strictly increasing."""
        df = pl.DataFrame(
            {"cat": ["A"] * 30 + ["B"] * 25 + ["C"] * 20 + ["D"] * 15 + ["E"] * 10}
        )
        result = pareto_analysis(df, "cat")

        for i in range(len(result.cumulative_percentages) - 1):
            assert result.cumulative_percentages[i] < result.cumulative_percentages[i + 1]


# ---------------------------------------------------------------------------
# Wilson Confidence Interval Tests
# ---------------------------------------------------------------------------


class TestWilsonConfidenceInterval:
    """Tests for wilson_confidence_interval()."""

    def test_basic_interval(self):
        """Basic interval computation for 50/100 at 95% confidence."""
        lower, upper = wilson_confidence_interval(50, 100)

        p_hat = 50 / 100
        assert lower <= p_hat <= upper
        assert 0 <= lower
        assert upper <= 1
        assert lower <= upper

    def test_bounds_contain_p_hat(self):
        """Interval always contains the point estimate."""
        lower, upper = wilson_confidence_interval(30, 200)
        p_hat = 30 / 200
        assert lower <= p_hat <= upper

    def test_zero_successes(self):
        """Zero successes still produces valid interval with lower≈0."""
        lower, upper = wilson_confidence_interval(0, 100)

        assert lower >= 0
        assert upper <= 1
        assert lower <= upper
        # p_hat = 0; lower should be essentially 0 (within floating-point tolerance)
        assert lower == pytest.approx(0.0, abs=1e-10)

    def test_all_successes(self):
        """All successes still produces valid interval with upper≤1."""
        lower, upper = wilson_confidence_interval(100, 100)

        assert lower >= 0
        assert upper <= 1
        assert lower <= upper
        assert upper >= 1.0  # p_hat=1, upper must be ≥ p_hat

    def test_small_sample(self):
        """Small sample size produces wider interval."""
        lower_small, upper_small = wilson_confidence_interval(5, 10)
        lower_large, upper_large = wilson_confidence_interval(50, 100)

        # Wider interval for smaller sample
        width_small = upper_small - lower_small
        width_large = upper_large - lower_large
        assert width_small > width_large

    def test_invalid_total_raises(self):
        """Total ≤ 0 raises ValueError."""
        with pytest.raises(ValueError, match="total must be > 0"):
            wilson_confidence_interval(0, 0)

    def test_successes_exceed_total_raises(self):
        """Successes > total raises ValueError."""
        with pytest.raises(ValueError, match="successes must satisfy"):
            wilson_confidence_interval(101, 100)

    def test_negative_successes_raises(self):
        """Negative successes raises ValueError."""
        with pytest.raises(ValueError, match="successes must satisfy"):
            wilson_confidence_interval(-1, 100)

    def test_custom_confidence_level(self):
        """Custom confidence level (e.g. 99%) produces wider interval than 95%."""
        lower_95, upper_95 = wilson_confidence_interval(50, 100, confidence=0.95)
        lower_99, upper_99 = wilson_confidence_interval(50, 100, confidence=0.99)

        # 99% CI should be wider than 95% CI
        assert (upper_99 - lower_99) > (upper_95 - lower_95)


# ---------------------------------------------------------------------------
# Chi-Square Test Tests
# ---------------------------------------------------------------------------


class TestChiSquareTest:
    """Tests for chi_square_test()."""

    def test_significant_association(self):
        """Detects significant association in clearly different distributions."""
        # Strong association between rows and columns
        contingency = pl.DataFrame(
            {
                "group_a": [100, 10, 5],
                "group_b": [10, 100, 5],
                "group_c": [5, 10, 100],
            }
        )
        result = chi_square_test(contingency)

        assert isinstance(result, TestResult)
        assert result.test_name == "chi_square"
        assert result.is_significant is True
        assert result.p_value < 0.05
        assert result.degrees_of_freedom is not None
        assert "association" in result.description.lower()

    def test_no_association(self):
        """Uniform distribution shows no association."""
        # Nearly identical distributions across groups
        contingency = pl.DataFrame(
            {
                "group_a": [50, 50, 50],
                "group_b": [50, 50, 50],
                "group_c": [50, 50, 50],
            }
        )
        result = chi_square_test(contingency)

        assert result.is_significant is False
        assert result.p_value >= 0.05

    def test_p_value_rounded_to_4_decimals(self):
        """p-value is rounded to 4 decimal places."""
        contingency = pl.DataFrame(
            {
                "a": [30, 20],
                "b": [25, 25],
            }
        )
        result = chi_square_test(contingency)

        # Check that p-value has at most 4 decimal places
        p_str = f"{result.p_value:.10f}"
        # After 4th decimal, remaining digits should be 0
        assert result.p_value == round(result.p_value, 4)

    def test_degrees_of_freedom_correct(self):
        """Degrees of freedom = (rows - 1) × (cols - 1)."""
        # 3 rows × 3 cols → dof = (3-1)×(3-1) = 4
        contingency = pl.DataFrame(
            {
                "a": [10, 20, 30],
                "b": [15, 25, 35],
                "c": [20, 30, 40],
            }
        )
        result = chi_square_test(contingency)
        assert result.degrees_of_freedom == 4  # (3-1)*(3-1)

    def test_excludes_string_label_column(self):
        """String label columns are excluded from contingency table."""
        contingency = pl.DataFrame(
            {
                "label": ["row_1", "row_2", "row_3"],
                "group_a": [100, 10, 5],
                "group_b": [10, 100, 5],
            }
        )
        result = chi_square_test(contingency)

        assert result.test_name == "chi_square"
        assert result.degrees_of_freedom == 2  # (3-1)*(2-1)

    def test_description_never_uses_causal_language(self):
        """Description uses 'association'/'correlation', never causal terms."""
        contingency = pl.DataFrame(
            {
                "a": [100, 10],
                "b": [10, 100],
            }
        )
        result = chi_square_test(contingency)

        _assert_no_causal_language(result.description)


# ---------------------------------------------------------------------------
# Two-Proportion Z-Test Tests
# ---------------------------------------------------------------------------


class TestTwoProportionZTest:
    """Tests for two_proportion_z_test()."""

    def test_significant_difference(self):
        """Detects significant difference between clearly different proportions."""
        result = two_proportion_z_test(n1=200, p1=0.80, n2=200, p2=0.50)

        assert isinstance(result, TestResult)
        assert result.test_name == "two_proportion_z"
        assert result.is_significant is True
        assert result.p_value < 0.05
        assert result.degrees_of_freedom is None
        assert "association" in result.description.lower()

    def test_no_significant_difference(self):
        """Similar proportions produce non-significant result."""
        result = two_proportion_z_test(n1=50, p1=0.50, n2=50, p2=0.48)

        assert result.is_significant is False
        assert result.p_value >= 0.05

    def test_identical_proportions(self):
        """Identical proportions produce p-value of 1.0."""
        result = two_proportion_z_test(n1=100, p1=0.50, n2=100, p2=0.50)

        assert result.statistic == 0.0
        assert result.p_value == 1.0
        assert result.is_significant is False

    def test_p_value_rounded_to_4_decimals(self):
        """p-value is rounded to 4 decimal places."""
        result = two_proportion_z_test(n1=100, p1=0.70, n2=100, p2=0.55)
        assert result.p_value == round(result.p_value, 4)

    def test_invalid_sample_size_raises(self):
        """Sample size ≤ 0 raises ValueError."""
        with pytest.raises(ValueError, match="Sample sizes"):
            two_proportion_z_test(n1=0, p1=0.5, n2=100, p2=0.5)

    def test_invalid_proportion_raises(self):
        """Proportion outside [0, 1] raises ValueError."""
        with pytest.raises(ValueError, match="Proportions"):
            two_proportion_z_test(n1=100, p1=1.5, n2=100, p2=0.5)

    def test_description_never_uses_causal_language(self):
        """Description uses 'association'/'correlation', never causal terms."""
        result = two_proportion_z_test(n1=200, p1=0.80, n2=200, p2=0.50)
        _assert_no_causal_language(result.description)

    def test_edge_proportions_zero_and_one(self):
        """Extreme proportions (0 and 1) still produce valid result."""
        result = two_proportion_z_test(n1=100, p1=0.0, n2=100, p2=1.0)

        assert result.is_significant is True
        assert result.p_value < 0.05


# ---------------------------------------------------------------------------
# Property 17: Statistical Finding Labeling (cross-cutting)
# ---------------------------------------------------------------------------


class TestStatisticalFindingLabeling:
    """Verify all test result descriptions use correct terminology."""

    def test_chi_square_significant_no_causal_language(self):
        """Chi-square significant description avoids causal language."""
        contingency = pl.DataFrame({"a": [100, 10], "b": [10, 100]})
        result = chi_square_test(contingency)
        _assert_no_causal_language(result.description)

    def test_chi_square_not_significant_no_causal_language(self):
        """Chi-square non-significant description avoids causal language."""
        contingency = pl.DataFrame({"a": [50, 50], "b": [50, 50]})
        result = chi_square_test(contingency)
        _assert_no_causal_language(result.description)

    def test_z_test_significant_no_causal_language(self):
        """Z-test significant description avoids causal language."""
        result = two_proportion_z_test(n1=200, p1=0.80, n2=200, p2=0.40)
        _assert_no_causal_language(result.description)

    def test_z_test_not_significant_no_causal_language(self):
        """Z-test non-significant description avoids causal language."""
        result = two_proportion_z_test(n1=50, p1=0.50, n2=50, p2=0.52)
        _assert_no_causal_language(result.description)

    def test_descriptions_contain_association_or_correlation(self):
        """Descriptions must contain 'association' or 'correlation'."""
        contingency = pl.DataFrame({"a": [100, 10], "b": [10, 100]})
        chi_result = chi_square_test(contingency)
        z_result = two_proportion_z_test(n1=200, p1=0.80, n2=200, p2=0.40)

        for result in [chi_result, z_result]:
            text = result.description.lower()
            assert "association" in text or "correlation" in text, (
                f"Description must contain 'association' or 'correlation': {result.description}"
            )


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

CAUSAL_TERMS_PATTERN = re.compile(
    r"\b(causes|leads\s+to|results\s+in)\b", re.IGNORECASE
)


def _assert_no_causal_language(text: str) -> None:
    """Assert that text does not contain causal language."""
    match = CAUSAL_TERMS_PATTERN.search(text)
    assert match is None, (
        f"Found forbidden causal term '{match.group()}' in: {text}"
    )
