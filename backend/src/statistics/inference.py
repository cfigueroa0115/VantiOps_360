"""Statistical inference module – Pareto analysis, confidence intervals, and hypothesis tests.

Implements:
- Pareto analysis: minimum set of categories accounting for ≥80% volume
- Wilson confidence interval: proportion estimates at 95% confidence
- Chi-square test: comparing >2 groups
- Two-proportion z-test: comparing exactly 2 groups

All statistical finding descriptions use "association" or "correlation" terminology,
never "causes", "leads to", or "results in".
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import polars as pl
from scipy import stats


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
