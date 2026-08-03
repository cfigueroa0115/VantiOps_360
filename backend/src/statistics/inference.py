"""Statistical inference module – Pareto analysis, confidence intervals, and hypothesis tests.

Implements:
- Pareto analysis: minimum set of categories accounting for ≥80% volume
- Wilson confidence interval: proportion estimates at 95% confidence
- Mean confidence interval: 95% CI for continuous variables (t-based)
- Chi-square test: comparing >2 groups
- Two-proportion z-test: comparing exactly 2 groups
- Shapiro-Wilk normality test: testing distribution normality

All statistical finding descriptions use "association" or "correlation" terminology,
never "causes", "leads to", or "results in".

Requirements: 9.2, 9.3
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import polars as pl
from scipy import stats

from statistics.descriptive import MIN_GROUP_SIZE


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class ParetoResult:
    """Result of Pareto analysis identifying minimum set of categories ≥80% volume."""

    categories: list[str]  # minimum set of categories accounting for ≥80% volume
    frequencies: list[int]  # counts per category (descending)
    cumulative_percentages: list[float]  # cumulative % after each category
    total_count: int
    pareto_threshold: float = 0.80  # 80%


@dataclass
class TestResult:
    """Result of a statistical hypothesis test."""

    test_name: str  # "chi_square" or "two_proportion_z"
    statistic: float
    p_value: float
    degrees_of_freedom: int | None
    is_significant: bool  # True if p_value < 0.05
    description: str  # uses "association" terminology, never "causes"


@dataclass
class NormalityTestResult:
    """Result of a Shapiro-Wilk normality test.

    Requirements: 9.2
    """

    test_name: str = "shapiro_wilk"
    statistic: float = 0.0
    p_value: float = 0.0
    is_normal: bool = False  # True if p_value >= 0.05 (fail to reject H0)
    sample_size: int = 0
    description: str = ""


@dataclass
class MeanConfidenceInterval:
    """Result of a confidence interval estimation for a population mean.

    Uses t-distribution for CI calculation at the specified confidence level.

    Requirements: 9.2
    """

    mean: float = 0.0
    lower: float = 0.0
    upper: float = 0.0
    confidence_level: float = 0.95
    std_error: float = 0.0
    sample_size: int = 0


# ---------------------------------------------------------------------------
# Pareto Analysis
# ---------------------------------------------------------------------------


def pareto_analysis(df: pl.DataFrame, col: str) -> ParetoResult:
    """Identify the minimum set of categories whose cumulative frequency ≥80% of total volume.

    Categories are ranked in descending order of frequency. The returned set is
    minimal: removing any single category would cause the cumulative share to
    drop below 80%.

    Parameters
    ----------
    df : pl.DataFrame
        Input DataFrame containing the column to analyze.
    col : str
        Column name for which to compute the Pareto analysis.

    Returns
    -------
    ParetoResult
        The minimum set of categories, their frequencies, cumulative percentages,
        total count, and the threshold used (0.80).
    """
    # Count frequencies per category, sorted descending
    freq_df = (
        df.select(pl.col(col))
        .drop_nulls()
        .group_by(col)
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
    )

    total_count = int(freq_df.select(pl.col("count").sum()).item())

    if total_count == 0:
        return ParetoResult(
            categories=[],
            frequencies=[],
            cumulative_percentages=[],
            total_count=0,
        )

    categories: list[str] = []
    frequencies: list[int] = []
    cumulative_percentages: list[float] = []
    cumulative_sum = 0

    threshold = 0.80

    for row in freq_df.iter_rows(named=True):
        cat = str(row[col])
        count = int(row["count"])

        cumulative_sum += count
        cumulative_pct = cumulative_sum / total_count

        categories.append(cat)
        frequencies.append(count)
        cumulative_percentages.append(cumulative_pct)

        if cumulative_pct >= threshold:
            break

    return ParetoResult(
        categories=categories,
        frequencies=frequencies,
        cumulative_percentages=cumulative_percentages,
        total_count=total_count,
        pareto_threshold=threshold,
    )


# ---------------------------------------------------------------------------
# Wilson Confidence Interval
# ---------------------------------------------------------------------------


def wilson_confidence_interval(
    successes: int, total: int, confidence: float = 0.95
) -> tuple[float, float]:
    """Compute the Wilson score confidence interval for a proportion estimate.

    Parameters
    ----------
    successes : int
        Number of successes (0 ≤ successes ≤ total).
    total : int
        Total number of trials (total > 0).
    confidence : float
        Confidence level (default 0.95 for 95% CI).

    Returns
    -------
    tuple[float, float]
        (lower, upper) bounds of the Wilson score interval.
        Guarantees: 0 ≤ lower ≤ p_hat ≤ upper ≤ 1.
    """
    if total <= 0:
        raise ValueError("total must be > 0")
    if successes < 0 or successes > total:
        raise ValueError("successes must satisfy 0 ≤ successes ≤ total")

    p_hat = successes / total
    z = stats.norm.ppf(1 - (1 - confidence) / 2)
    z_sq = z * z

    denominator = 1 + z_sq / total
    centre = p_hat + z_sq / (2 * total)
    margin = z * np.sqrt((p_hat * (1 - p_hat) + z_sq / (4 * total)) / total)

    lower = (centre - margin) / denominator
    upper = (centre + margin) / denominator

    # Clamp to [0, 1]
    lower = max(0.0, float(lower))
    upper = min(1.0, float(upper))

    return (lower, upper)


# ---------------------------------------------------------------------------
# Chi-Square Test
# ---------------------------------------------------------------------------


def chi_square_test(contingency_df: pl.DataFrame) -> TestResult:
    """Perform a chi-square test of independence on a contingency table.

    Used for comparing proportions across >2 groups.

    Parameters
    ----------
    contingency_df : pl.DataFrame
        A contingency table where rows represent categories and columns
        represent groups. All values should be numeric counts.
        The first column may be a label column (string type) and will be excluded.

    Returns
    -------
    TestResult
        Test result with chi-square statistic, p-value (rounded to 4 decimals),
        degrees of freedom, significance flag, and description using
        "association" terminology.
    """
    # Extract numeric columns only (exclude string label columns)
    numeric_cols = [
        c for c in contingency_df.columns if contingency_df[c].dtype in (pl.Int64, pl.Int32, pl.Int16, pl.Int8, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64, pl.Float32, pl.Float64)
    ]

    if not numeric_cols:
        raise ValueError("contingency_df must contain at least one numeric column")

    observed = contingency_df.select(numeric_cols).to_numpy()

    chi2_stat, p_value, dof, _ = stats.chi2_contingency(observed)

    p_value_rounded = round(float(p_value), 4)
    is_significant = p_value_rounded < 0.05

    if is_significant:
        description = (
            "Statistically significant association detected between the variables "
            f"(chi-square = {chi2_stat:.4f}, p = {p_value_rounded}). "
            "The observed distribution shows a correlation with group membership."
        )
    else:
        description = (
            "No statistically significant association detected between the variables "
            f"(chi-square = {chi2_stat:.4f}, p = {p_value_rounded}). "
            "The observed differences are consistent with random variation."
        )

    return TestResult(
        test_name="chi_square",
        statistic=round(float(chi2_stat), 4),
        p_value=p_value_rounded,
        degrees_of_freedom=int(dof),
        is_significant=is_significant,
        description=description,
    )


# ---------------------------------------------------------------------------
# Two-Proportion Z-Test
# ---------------------------------------------------------------------------


def two_proportion_z_test(n1: int, p1: float, n2: int, p2: float) -> TestResult:
    """Perform a two-proportion z-test for comparing exactly 2 groups.

    Parameters
    ----------
    n1 : int
        Sample size of group 1.
    p1 : float
        Observed proportion in group 1 (0 ≤ p1 ≤ 1).
    n2 : int
        Sample size of group 2.
    p2 : float
        Observed proportion in group 2 (0 ≤ p2 ≤ 1).

    Returns
    -------
    TestResult
        Test result with z-statistic, p-value (rounded to 4 decimals),
        significance flag, and description using "association" terminology.
    """
    if n1 <= 0 or n2 <= 0:
        raise ValueError("Sample sizes n1 and n2 must be > 0")
    if not (0 <= p1 <= 1) or not (0 <= p2 <= 1):
        raise ValueError("Proportions p1 and p2 must be between 0 and 1")

    # Number of successes in each group
    count1 = int(round(p1 * n1))
    count2 = int(round(p2 * n2))

    # Pooled proportion
    p_pool = (count1 + count2) / (n1 + n2)

    # Standard error
    se = np.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))

    if se == 0:
        # Both proportions are identical (0 or 1)
        z_stat = 0.0
        p_value = 1.0
    else:
        z_stat = (p1 - p2) / se
        # Two-tailed test
        p_value = float(2 * (1 - stats.norm.cdf(abs(z_stat))))

    p_value_rounded = round(p_value, 4)
    is_significant = p_value_rounded < 0.05

    if is_significant:
        description = (
            "Statistically significant association detected between group membership "
            f"and the observed proportion (z = {z_stat:.4f}, p = {p_value_rounded}). "
            "The difference in proportions shows a correlation with group identity."
        )
    else:
        description = (
            "No statistically significant association detected between group membership "
            f"and the observed proportion (z = {z_stat:.4f}, p = {p_value_rounded}). "
            "The difference in proportions is consistent with random variation."
        )

    return TestResult(
        test_name="two_proportion_z",
        statistic=round(float(z_stat), 4),
        p_value=p_value_rounded,
        degrees_of_freedom=None,
        is_significant=is_significant,
        description=description,
    )



# ---------------------------------------------------------------------------
# Shapiro-Wilk Normality Test
# ---------------------------------------------------------------------------


def shapiro_wilk_test(data: pl.Series) -> NormalityTestResult:
    """Perform Shapiro-Wilk normality test on a numeric series.

    Tests the null hypothesis that the data was drawn from a normal distribution.
    If p_value >= 0.05, we fail to reject H0 (data is consistent with normality).

    Parameters
    ----------
    data : pl.Series
        Numeric series to test. Null values are excluded.
        Requires at least MIN_GROUP_SIZE (5) non-null values.

    Returns
    -------
    NormalityTestResult
        Test result with statistic, p-value, normality flag, and description.

    Raises
    ------
    ValueError
        If fewer than MIN_GROUP_SIZE non-null values are present.

    Requirements: 9.2, 9.3
    """
    non_null = data.drop_nulls().cast(pl.Float64, strict=False)
    n = len(non_null)

    if n < MIN_GROUP_SIZE:
        raise ValueError(
            f"Shapiro-Wilk test requires at least {MIN_GROUP_SIZE} non-null values, "
            f"got {n}. Group excluded for privacy protection."
        )

    values = non_null.to_numpy()
    stat, p_value = stats.shapiro(values)

    p_value_rounded = round(float(p_value), 4)
    is_normal = p_value_rounded >= 0.05

    if is_normal:
        description = (
            f"The data appears consistent with a normal distribution "
            f"(Shapiro-Wilk W = {stat:.4f}, p = {p_value_rounded}). "
            f"We fail to reject the null hypothesis of normality at α = 0.05."
        )
    else:
        description = (
            f"The data deviates significantly from a normal distribution "
            f"(Shapiro-Wilk W = {stat:.4f}, p = {p_value_rounded}). "
            f"The null hypothesis of normality is rejected at α = 0.05."
        )

    return NormalityTestResult(
        test_name="shapiro_wilk",
        statistic=round(float(stat), 4),
        p_value=p_value_rounded,
        is_normal=is_normal,
        sample_size=n,
        description=description,
    )


# ---------------------------------------------------------------------------
# Mean Confidence Interval (95% CI, t-based)
# ---------------------------------------------------------------------------


def mean_confidence_interval(
    data: pl.Series, confidence: float = 0.95
) -> MeanConfidenceInterval:
    """Compute a confidence interval for the population mean using t-distribution.

    Parameters
    ----------
    data : pl.Series
        Numeric series. Null values are excluded.
        Requires at least MIN_GROUP_SIZE (5) non-null values.
    confidence : float
        Confidence level (default 0.95 for 95% CI).

    Returns
    -------
    MeanConfidenceInterval
        Mean, lower bound, upper bound, std error, and sample size.

    Raises
    ------
    ValueError
        If fewer than MIN_GROUP_SIZE non-null values or fewer than 2 for CI computation.

    Requirements: 9.2, 9.3
    """
    non_null = data.drop_nulls().cast(pl.Float64, strict=False)
    n = len(non_null)

    if n < MIN_GROUP_SIZE:
        raise ValueError(
            f"Confidence interval requires at least {MIN_GROUP_SIZE} non-null values, "
            f"got {n}. Group excluded for privacy protection."
        )

    values = non_null.to_numpy()
    sample_mean = float(np.mean(values))
    sample_std = float(np.std(values, ddof=1))  # sample std with Bessel correction
    std_error = sample_std / np.sqrt(n)

    # t critical value for (1 - alpha/2) and n-1 degrees of freedom
    alpha = 1 - confidence
    t_crit = float(stats.t.ppf(1 - alpha / 2, df=n - 1))

    margin = t_crit * std_error
    lower = sample_mean - margin
    upper = sample_mean + margin

    return MeanConfidenceInterval(
        mean=round(sample_mean, 2),
        lower=round(lower, 2),
        upper=round(upper, 2),
        confidence_level=confidence,
        std_error=round(std_error, 4),
        sample_size=n,
    )


# ---------------------------------------------------------------------------
# Grouped inference with MIN_GROUP_SIZE enforcement
# ---------------------------------------------------------------------------


def grouped_shapiro_wilk(
    df: pl.DataFrame,
    value_col: str,
    group_col: str,
    min_group_size: int = MIN_GROUP_SIZE,
) -> dict[str, NormalityTestResult]:
    """Perform Shapiro-Wilk test per group, excluding small groups.

    Groups with fewer than `min_group_size` records are excluded
    for privacy protection (Requirement 9.3).

    Parameters
    ----------
    df : pl.DataFrame
        Input DataFrame.
    value_col : str
        Numeric column to test for normality.
    group_col : str
        Column to group by.
    min_group_size : int
        Minimum group size (default MIN_GROUP_SIZE = 5).

    Returns
    -------
    dict[str, NormalityTestResult]
        Results per group. Small groups are excluded.

    Requirements: 9.2, 9.3
    """
    results: dict[str, NormalityTestResult] = {}
    df_filtered = df.filter(pl.col(group_col).is_not_null())

    group_counts = df_filtered.group_by(group_col).agg(pl.len().alias("__count__"))

    for row in group_counts.iter_rows(named=True):
        group_value = str(row[group_col])
        group_size = int(row["__count__"])

        if group_size < min_group_size:
            continue

        group_df = df_filtered.filter(pl.col(group_col) == row[group_col])
        result = shapiro_wilk_test(group_df[value_col])
        results[group_value] = result

    return results


def grouped_mean_ci(
    df: pl.DataFrame,
    value_col: str,
    group_col: str,
    confidence: float = 0.95,
    min_group_size: int = MIN_GROUP_SIZE,
) -> dict[str, MeanConfidenceInterval]:
    """Compute mean confidence intervals per group, excluding small groups.

    Groups with fewer than `min_group_size` records are excluded
    for privacy protection (Requirement 9.3).

    Parameters
    ----------
    df : pl.DataFrame
        Input DataFrame.
    value_col : str
        Numeric column to compute CI for.
    group_col : str
        Column to group by.
    confidence : float
        Confidence level (default 0.95).
    min_group_size : int
        Minimum group size (default MIN_GROUP_SIZE = 5).

    Returns
    -------
    dict[str, MeanConfidenceInterval]
        CI results per group. Small groups are excluded.

    Requirements: 9.2, 9.3
    """
    results: dict[str, MeanConfidenceInterval] = {}
    df_filtered = df.filter(pl.col(group_col).is_not_null())

    group_counts = df_filtered.group_by(group_col).agg(pl.len().alias("__count__"))

    for row in group_counts.iter_rows(named=True):
        group_value = str(row[group_col])
        group_size = int(row["__count__"])

        if group_size < min_group_size:
            continue

        group_df = df_filtered.filter(pl.col(group_col) == row[group_col])
        result = mean_confidence_interval(group_df[value_col], confidence=confidence)
        results[group_value] = result

    return results
