"""Unit tests for statistics.inference module.

Tests Pareto analysis, Wilson confidence interval, chi-square test,
and two-proportion z-test implementations.
"""

import re
from statistics.inference import (
    MeanConfidenceInterval,
    NormalityTestResult,
    ParetoResult,
    TestResult,
    chi_square_test,
    grouped_mean_ci,
    grouped_shapiro_wilk,
    mean_confidence_interval,
    pareto_analysis,
    shapiro_wilk_test,
    two_proportion_z_test,
    wilson_confidence_interval,
)

import polars as pl
import pytest

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
# Shapiro-Wilk Normality Test Tests
# ---------------------------------------------------------------------------


class TestShapiroWilkTest:
    """Tests for shapiro_wilk_test() (Requirement 9.2)."""

    def test_normal_distribution_passes(self):
        """Data from a normal distribution should not reject normality."""
        # Use a known normal sample (large enough to be stable)
        np_rng = __import__("numpy").random.default_rng(42)
        normal_data = np_rng.normal(loc=10.0, scale=2.0, size=50)
        series = pl.Series("time", normal_data.tolist())

        result = shapiro_wilk_test(series)

        assert isinstance(result, NormalityTestResult)
        assert result.test_name == "shapiro_wilk"
        assert result.is_normal is True
        assert result.p_value >= 0.05
        assert result.sample_size == 50

    def test_non_normal_distribution_rejects(self):
        """Strongly non-normal data (e.g., exponential) should reject normality."""
        np_rng = __import__("numpy").random.default_rng(42)
        exp_data = np_rng.exponential(scale=5.0, size=100)
        series = pl.Series("time", exp_data.tolist())

        result = shapiro_wilk_test(series)

        assert result.is_normal is False
        assert result.p_value < 0.05

    def test_min_group_size_enforced(self):
        """Raises ValueError when fewer than MIN_GROUP_SIZE values."""
        series = pl.Series("time", [1.0, 2.0, 3.0, 4.0])  # 4 < 5
        with pytest.raises(ValueError, match="at least"):
            shapiro_wilk_test(series)

    def test_exactly_min_group_size(self):
        """Exactly MIN_GROUP_SIZE values should be accepted."""
        series = pl.Series("time", [1.0, 2.0, 3.0, 4.0, 5.0])
        result = shapiro_wilk_test(series)
        assert result.sample_size == 5

    def test_null_values_excluded(self):
        """Null values are excluded before testing."""
        series = pl.Series("time", [1.0, 2.0, 3.0, None, 4.0, 5.0, None])
        result = shapiro_wilk_test(series)
        assert result.sample_size == 5

    def test_p_value_rounded_to_4_decimals(self):
        """p-value is rounded to 4 decimal places."""
        series = pl.Series("time", [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0])
        result = shapiro_wilk_test(series)
        assert result.p_value == round(result.p_value, 4)


# ---------------------------------------------------------------------------
# Mean Confidence Interval Tests
# ---------------------------------------------------------------------------


class TestMeanConfidenceInterval:
    """Tests for mean_confidence_interval() (Requirement 9.2)."""

    def test_basic_ci(self):
        """CI contains the sample mean and bounds are ordered."""
        series = pl.Series("time", [10.0, 12.0, 14.0, 16.0, 18.0, 20.0])
        result = mean_confidence_interval(series)

        assert isinstance(result, MeanConfidenceInterval)
        assert result.lower <= result.mean <= result.upper
        assert result.confidence_level == 0.95
        assert result.sample_size == 6
        assert result.mean == pytest.approx(15.0, abs=0.01)

    def test_larger_sample_narrower_ci(self):
        """Larger sample size produces narrower CI."""
        small = pl.Series("t", [5.0, 10.0, 15.0, 20.0, 25.0])
        large = pl.Series("t", [5.0, 10.0, 15.0, 20.0, 25.0] * 10)

        ci_small = mean_confidence_interval(small)
        ci_large = mean_confidence_interval(large)

        width_small = ci_small.upper - ci_small.lower
        width_large = ci_large.upper - ci_large.lower
        assert width_large < width_small

    def test_min_group_size_enforced(self):
        """Raises ValueError when fewer than MIN_GROUP_SIZE values."""
        series = pl.Series("time", [1.0, 2.0, 3.0])  # 3 < 5
        with pytest.raises(ValueError, match="at least"):
            mean_confidence_interval(series)

    def test_null_values_excluded(self):
        """Null values are excluded before computing CI."""
        series = pl.Series("time", [1.0, None, 3.0, 4.0, 5.0, 6.0, None])
        result = mean_confidence_interval(series)
        assert result.sample_size == 5

    def test_constant_series_zero_width(self):
        """Constant values produce a zero-width CI (lower == upper == mean)."""
        series = pl.Series("time", [7.0] * 10)
        result = mean_confidence_interval(series)
        assert result.lower == result.mean == result.upper == 7.0

    def test_custom_confidence_level(self):
        """99% CI is wider than 95% CI."""
        series = pl.Series("time", [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0])
        ci_95 = mean_confidence_interval(series, confidence=0.95)
        ci_99 = mean_confidence_interval(series, confidence=0.99)

        width_95 = ci_95.upper - ci_95.lower
        width_99 = ci_99.upper - ci_99.lower
        assert width_99 > width_95


# ---------------------------------------------------------------------------
# Grouped Inference with MIN_GROUP_SIZE Tests
# ---------------------------------------------------------------------------


class TestGroupedInference:
    """Tests for grouped_shapiro_wilk and grouped_mean_ci (Req 9.2, 9.3)."""

    def test_grouped_shapiro_excludes_small_groups(self):
        """Groups below MIN_GROUP_SIZE are excluded from Shapiro-Wilk results."""
        df = pl.DataFrame({
            "time": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 1.0, 2.0, 3.0],
            "cause": ["A"] * 10 + ["B"] * 3,
        })
        results = grouped_shapiro_wilk(df, "time", "cause")

        assert "A" in results
        assert "B" not in results  # only 3 records

    def test_grouped_mean_ci_excludes_small_groups(self):
        """Groups below MIN_GROUP_SIZE are excluded from CI results."""
        df = pl.DataFrame({
            "time": [5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 1.0, 2.0],
            "cause": ["X"] * 6 + ["Y"] * 2,
        })
        results = grouped_mean_ci(df, "time", "cause")

        assert "X" in results
        assert "Y" not in results  # only 2 records

    def test_grouped_shapiro_at_boundary(self):
        """Groups with exactly MIN_GROUP_SIZE records are included."""
        df = pl.DataFrame({
            "time": [1.0, 2.0, 3.0, 4.0, 5.0],
            "cause": ["A"] * 5,
        })
        results = grouped_shapiro_wilk(df, "time", "cause")
        assert "A" in results

    def test_grouped_mean_ci_at_boundary(self):
        """Groups with exactly MIN_GROUP_SIZE records are included in CI."""
        df = pl.DataFrame({
            "time": [10.0, 20.0, 30.0, 40.0, 50.0],
            "cause": ["Z"] * 5,
        })
        results = grouped_mean_ci(df, "time", "cause")
        assert "Z" in results
        assert results["Z"].mean == 30.0


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
