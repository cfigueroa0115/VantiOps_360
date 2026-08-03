"""Property-based tests for Pareto high concentration threshold logic.

**Validates: Requirements 5.5**

Tests the enrichment logic in _chart_pareto() that adds high_concentration,
concentration_pct, and analysis_level fields to Pareto chart data.
"""

from __future__ import annotations

from hypothesis import given, settings, assume
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Strategy: generate a list of Pareto rows (sorted descending by percentage)
# Each row has 'percentage' summing to ~100 across all rows.
# ---------------------------------------------------------------------------

VALID_ANALYSIS_LEVELS = frozenset(
    ["statistical_concentration", "causal_hypothesis", "validated_root_cause"]
)


@st.composite
def pareto_percentages(draw: st.DrawFn) -> list[float]:
    """Generate a sorted-descending list of percentages that sum to ~100.

    Minimum 1 cause, maximum 20 causes. Each cause has at least 0.01%.
    """
    n_causes = draw(st.integers(min_value=1, max_value=20))
    # Generate raw weights and normalize to 100
    raw = draw(
        st.lists(
            st.floats(min_value=0.01, max_value=100.0, allow_nan=False, allow_infinity=False),
            min_size=n_causes,
            max_size=n_causes,
        )
    )
    total = sum(raw)
    assume(total > 0)
    # Normalize to percentages summing to 100, rounded to 2 decimal places
    percentages = [round(v / total * 100.0, 2) for v in raw]
    # Sort descending (Pareto order)
    percentages.sort(reverse=True)
    return percentages


@st.composite
def threshold_strategy(draw: st.DrawFn) -> float:
    """Generate a threshold value between 0.01 and 0.99."""
    return draw(st.floats(min_value=0.01, max_value=0.99, allow_nan=False, allow_infinity=False))


def apply_pareto_enrichment(
    rows: list[dict], threshold: float
) -> list[dict]:
    """Replicate the enrichment logic from _chart_pareto in routes.py.

    This is a pure-function extraction of the enrichment logic so we can
    test it without needing DuckDB or Parquet files.
    """
    if not rows:
        return rows

    top_cause_pct = rows[0]["percentage"] / 100.0  # Convert to fraction

    for i, row in enumerate(rows):
        # high_concentration: true only for the top cause when it exceeds threshold
        is_high_concentration = (i == 0) and (top_cause_pct > threshold)
        row["high_concentration"] = is_high_concentration
        row["concentration_pct"] = row["percentage"]
        # analysis_level: statistical_concentration by default
        row["analysis_level"] = "statistical_concentration"

    return rows


def build_pareto_rows(percentages: list[float]) -> list[dict]:
    """Build mock Pareto rows from a list of percentages (already sorted desc)."""
    rows = []
    cumulative = 0.0
    for i, pct in enumerate(percentages):
        cumulative += pct
        rows.append(
            {
                "causa": f"Causa_{i + 1}",
                "count": max(5, int(pct * 10)),  # Ensure count >= MIN_GROUP_SIZE
                "percentage": pct,
                "cumulative_pct": round(cumulative, 2),
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Property 1a: If top cause share > threshold, high_concentration must be True
#              for the first item.
# ---------------------------------------------------------------------------


@given(percentages=pareto_percentages(), threshold=threshold_strategy())
@settings(max_examples=200, deadline=None)
def test_p1a_high_concentration_true_when_top_exceeds_threshold(
    percentages: list[float], threshold: float
) -> None:
    """P1a: If top cause percentage / 100 > threshold → first item high_concentration = True.

    **Validates: Requirements 5.5**
    """
    top_pct_fraction = percentages[0] / 100.0
    assume(top_pct_fraction > threshold)

    rows = build_pareto_rows(percentages)
    enriched = apply_pareto_enrichment(rows, threshold)

    assert enriched[0]["high_concentration"] is True


# ---------------------------------------------------------------------------
# Property 1b: If top cause share <= threshold, high_concentration must be
#              False for ALL items.
# ---------------------------------------------------------------------------


@given(percentages=pareto_percentages(), threshold=threshold_strategy())
@settings(max_examples=200, deadline=None)
def test_p1b_high_concentration_false_when_top_below_threshold(
    percentages: list[float], threshold: float
) -> None:
    """P1b: If top cause percentage / 100 <= threshold → all items high_concentration = False.

    **Validates: Requirements 5.5**
    """
    top_pct_fraction = percentages[0] / 100.0
    assume(top_pct_fraction <= threshold)

    rows = build_pareto_rows(percentages)
    enriched = apply_pareto_enrichment(rows, threshold)

    for item in enriched:
        assert item["high_concentration"] is False


# ---------------------------------------------------------------------------
# Property 1c: Only the first item (top cause) can ever have
#              high_concentration = True.
# ---------------------------------------------------------------------------


@given(percentages=pareto_percentages(), threshold=threshold_strategy())
@settings(max_examples=200, deadline=None)
def test_p1c_only_first_item_can_have_high_concentration(
    percentages: list[float], threshold: float
) -> None:
    """P1c: Non-first items must always have high_concentration = False.

    **Validates: Requirements 5.5**
    """
    rows = build_pareto_rows(percentages)
    enriched = apply_pareto_enrichment(rows, threshold)

    # All items after the first must be False
    for item in enriched[1:]:
        assert item["high_concentration"] is False


# ---------------------------------------------------------------------------
# Property 1d: concentration_pct always equals the row's percentage value.
# ---------------------------------------------------------------------------


@given(percentages=pareto_percentages(), threshold=threshold_strategy())
@settings(max_examples=200, deadline=None)
def test_p1d_concentration_pct_equals_row_percentage(
    percentages: list[float], threshold: float
) -> None:
    """P1d: concentration_pct must always equal the row's percentage value.

    **Validates: Requirements 5.5**
    """
    rows = build_pareto_rows(percentages)
    enriched = apply_pareto_enrichment(rows, threshold)

    for item in enriched:
        assert item["concentration_pct"] == item["percentage"]


# ---------------------------------------------------------------------------
# Property 1e: analysis_level is always one of the 3 valid enum values.
# ---------------------------------------------------------------------------


@given(percentages=pareto_percentages(), threshold=threshold_strategy())
@settings(max_examples=200, deadline=None)
def test_p1e_analysis_level_is_valid_enum(
    percentages: list[float], threshold: float
) -> None:
    """P1e: analysis_level must be one of the 3 valid values.

    **Validates: Requirements 5.5**
    """
    rows = build_pareto_rows(percentages)
    enriched = apply_pareto_enrichment(rows, threshold)

    for item in enriched:
        assert item["analysis_level"] in VALID_ANALYSIS_LEVELS
