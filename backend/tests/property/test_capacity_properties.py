"""
Property-based tests for capacity model formula enforcement (Property 13).

**Validates: Requirements 20.1, 20.3**

Uses Hypothesis to verify:
- P13a: calculate_net_capacity(hours, factor) always equals hours × factor
- P13b: calculate_utilization(load, capacity) always equals (load/capacity) × 100
- P13c: Alert level is monotonically non-decreasing with utilization (green ≤ yellow ≤ orange ≤ red)
- P13d: Alert thresholds are correctly applied at boundary values
- P13e: get_capacity_summary always produces consistent results (utilization matches formula)
"""

import math

import hypothesis.strategies as st
from hypothesis import assume, given, settings

from operations.capacity import (
    ALERT_THRESHOLD_GREEN_MAX,
    ALERT_THRESHOLD_ORANGE_MAX,
    ALERT_THRESHOLD_YELLOW_MAX,
    calculate_net_capacity,
    calculate_utilization,
    get_alert_level,
    get_capacity_summary,
)

# --- Strategies ---

# Hours: non-negative floats in a practical range
hours_strategy = st.floats(min_value=0.0, max_value=10000.0, allow_nan=False, allow_infinity=False)

# Productivity factor: must be in (0, 1]
productivity_factor_strategy = st.floats(
    min_value=0.01, max_value=1.0, allow_nan=False, allow_infinity=False
)

# Current load: non-negative floats
load_strategy = st.floats(min_value=0.0, max_value=50000.0, allow_nan=False, allow_infinity=False)

# Net capacity: positive floats (for utilization calculation)
positive_capacity_strategy = st.floats(
    min_value=0.01, max_value=50000.0, allow_nan=False, allow_infinity=False
)

# Utilization percentage: non-negative floats (can exceed 100%)
utilization_strategy = st.floats(
    min_value=0.0, max_value=500.0, allow_nan=False, allow_infinity=False
)

# Alert level ordering for monotonicity checks
ALERT_LEVEL_ORDER = {"green": 0, "yellow": 1, "orange": 2, "red": 3}

# Team config strategy for get_capacity_summary
analysts_strategy = st.integers(min_value=1, max_value=100)
monthly_hours_strategy = st.floats(
    min_value=1.0, max_value=300.0, allow_nan=False, allow_infinity=False
)
pqr_dedication_strategy = st.floats(
    min_value=0.01, max_value=1.0, allow_nan=False, allow_infinity=False
)


# --- Property Tests ---


class TestNetCapacityFormula:
    """P13a: calculate_net_capacity(hours, factor) always equals hours × factor."""

    @given(hours=hours_strategy, factor=productivity_factor_strategy)
    @settings(max_examples=200)
    def test_net_capacity_equals_hours_times_factor(self, hours: float, factor: float):
        """Net capacity must always equal hours × productivityFactor (REQ-20.1 formula)."""
        result = calculate_net_capacity(hours, factor)
        expected = hours * factor

        assert math.isclose(
            result, expected, rel_tol=1e-9
        ), f"calculate_net_capacity({hours}, {factor}) = {result}, expected {expected}"

    @given(hours=hours_strategy, factor=productivity_factor_strategy)
    @settings(max_examples=100)
    def test_net_capacity_non_negative(self, hours: float, factor: float):
        """Net capacity must always be non-negative for valid inputs."""
        result = calculate_net_capacity(hours, factor)

        assert (
            result >= 0.0
        ), f"Net capacity is negative: calculate_net_capacity({hours}, {factor}) = {result}"


class TestUtilizationFormula:
    """P13b: calculate_utilization(load, capacity) always equals (load/capacity) × 100."""

    @given(load=load_strategy, capacity=positive_capacity_strategy)
    @settings(max_examples=200)
    def test_utilization_equals_load_over_capacity_times_100(self, load: float, capacity: float):
        """Utilization must always equal (currentLoad / netCapacity) × 100."""
        result = calculate_utilization(load, capacity)
        expected = (load / capacity) * 100.0

        assert math.isclose(
            result, expected, rel_tol=1e-9
        ), f"calculate_utilization({load}, {capacity}) = {result}, expected {expected}"

    @given(load=load_strategy, capacity=positive_capacity_strategy)
    @settings(max_examples=100)
    def test_utilization_non_negative(self, load: float, capacity: float):
        """Utilization must always be non-negative for valid inputs."""
        result = calculate_utilization(load, capacity)

        assert (
            result >= 0.0
        ), f"Utilization is negative: calculate_utilization({load}, {capacity}) = {result}"

    @given(capacity=positive_capacity_strategy)
    @settings(max_examples=50)
    def test_zero_load_gives_zero_utilization(self, capacity: float):
        """Zero load must always produce zero utilization."""
        result = calculate_utilization(0.0, capacity)

        assert result == 0.0, f"Zero load produced non-zero utilization: {result}"


class TestAlertLevelMonotonicity:
    """P13c: Alert level is monotonically non-decreasing with utilization."""

    @given(
        u1=utilization_strategy,
        u2=utilization_strategy,
    )
    @settings(max_examples=200)
    def test_alert_level_monotonically_non_decreasing(self, u1: float, u2: float):
        """If utilization_a <= utilization_b, then alert_level(a) <= alert_level(b)."""
        assume(u1 <= u2)

        level_a = get_alert_level(u1)
        level_b = get_alert_level(u2)

        assert (
            ALERT_LEVEL_ORDER[level_a] <= ALERT_LEVEL_ORDER[level_b]
        ), f"Monotonicity violated: utilization {u1} → '{level_a}' but utilization {u2} → '{level_b}'"

    @given(utilization=utilization_strategy)
    @settings(max_examples=100)
    def test_alert_level_is_valid_value(self, utilization: float):
        """Alert level must always be one of green, yellow, orange, or red."""
        level = get_alert_level(utilization)

        assert level in {
            "green",
            "yellow",
            "orange",
            "red",
        }, f"Invalid alert level '{level}' for utilization {utilization}"


class TestAlertThresholdBoundaries:
    """P13d: Alert thresholds are correctly applied at boundary values."""

    @given(
        utilization=st.floats(
            min_value=0.0,
            max_value=ALERT_THRESHOLD_GREEN_MAX,
            allow_nan=False,
            allow_infinity=False,
        )
    )
    @settings(max_examples=100)
    def test_green_zone(self, utilization: float):
        """Utilization ≤ 60% must always produce green alert level."""
        level = get_alert_level(utilization)

        assert (
            level == "green"
        ), f"Utilization {utilization}% (≤ {ALERT_THRESHOLD_GREEN_MAX}%) should be 'green', got '{level}'"

    @given(
        utilization=st.floats(
            min_value=ALERT_THRESHOLD_GREEN_MAX + 0.001,
            max_value=ALERT_THRESHOLD_YELLOW_MAX,
            allow_nan=False,
            allow_infinity=False,
        )
    )
    @settings(max_examples=100)
    def test_yellow_zone(self, utilization: float):
        """Utilization > 60% and ≤ 80% must always produce yellow alert level."""
        assume(utilization > ALERT_THRESHOLD_GREEN_MAX)

        level = get_alert_level(utilization)

        assert level == "yellow", (
            f"Utilization {utilization}% (>{ALERT_THRESHOLD_GREEN_MAX}% and ≤{ALERT_THRESHOLD_YELLOW_MAX}%) "
            f"should be 'yellow', got '{level}'"
        )

    @given(
        utilization=st.floats(
            min_value=ALERT_THRESHOLD_YELLOW_MAX + 0.001,
            max_value=ALERT_THRESHOLD_ORANGE_MAX,
            allow_nan=False,
            allow_infinity=False,
        )
    )
    @settings(max_examples=100)
    def test_orange_zone(self, utilization: float):
        """Utilization > 80% and ≤ 95% must always produce orange alert level."""
        assume(utilization > ALERT_THRESHOLD_YELLOW_MAX)

        level = get_alert_level(utilization)

        assert level == "orange", (
            f"Utilization {utilization}% (>{ALERT_THRESHOLD_YELLOW_MAX}% and ≤{ALERT_THRESHOLD_ORANGE_MAX}%) "
            f"should be 'orange', got '{level}'"
        )

    @given(
        utilization=st.floats(
            min_value=ALERT_THRESHOLD_ORANGE_MAX + 0.001,
            max_value=500.0,
            allow_nan=False,
            allow_infinity=False,
        )
    )
    @settings(max_examples=100)
    def test_red_zone(self, utilization: float):
        """Utilization > 95% must always produce red alert level."""
        assume(utilization > ALERT_THRESHOLD_ORANGE_MAX)

        level = get_alert_level(utilization)

        assert level == "red", (
            f"Utilization {utilization}% (>{ALERT_THRESHOLD_ORANGE_MAX}%) "
            f"should be 'red', got '{level}'"
        )

    def test_exact_boundary_green_max(self):
        """Exact boundary at green max should be green."""
        assert get_alert_level(ALERT_THRESHOLD_GREEN_MAX) == "green"

    def test_exact_boundary_yellow_max(self):
        """Exact boundary at yellow max should be yellow."""
        assert get_alert_level(ALERT_THRESHOLD_YELLOW_MAX) == "yellow"

    def test_exact_boundary_orange_max(self):
        """Exact boundary at orange max should be orange."""
        assert get_alert_level(ALERT_THRESHOLD_ORANGE_MAX) == "orange"


class TestCapacitySummaryConsistency:
    """P13e: get_capacity_summary always produces consistent results (utilization matches formula)."""

    @given(
        analysts=analysts_strategy,
        monthly_hours=monthly_hours_strategy,
        pqr_dedication=pqr_dedication_strategy,
        factor=productivity_factor_strategy,
        load=load_strategy,
    )
    @settings(max_examples=200)
    def test_summary_utilization_matches_formula(
        self,
        analysts: int,
        monthly_hours: float,
        pqr_dedication: float,
        factor: float,
        load: float,
    ):
        """The summary's utilization must match (load / net_capacity) × 100."""
        config = {
            "analysts": analysts,
            "monthly_hours_base": monthly_hours,
            "pqr_dedication": pqr_dedication,
            "productivity_factor": factor,
            "current_load": load,
        }

        summary = get_capacity_summary(config)

        # Verify net_capacity = available_hours × factor
        expected_available = analysts * monthly_hours * pqr_dedication
        assert math.isclose(
            summary.available_hours, expected_available, rel_tol=1e-9
        ), f"available_hours {summary.available_hours} != expected {expected_available}"

        expected_net = expected_available * factor
        assert math.isclose(
            summary.net_capacity, expected_net, rel_tol=1e-9
        ), f"net_capacity {summary.net_capacity} != expected {expected_net}"

        # Verify utilization = (load / net_capacity) × 100
        if summary.net_capacity > 0:
            expected_util = (load / summary.net_capacity) * 100.0
            assert math.isclose(
                summary.utilization, expected_util, rel_tol=1e-9
            ), f"utilization {summary.utilization} != expected {expected_util}"

        # Verify alert level consistency with utilization
        expected_alert = get_alert_level(summary.utilization)
        assert summary.alert_level == expected_alert, (
            f"alert_level '{summary.alert_level}' != expected '{expected_alert}' "
            f"for utilization {summary.utilization}%"
        )

    @given(
        analysts=analysts_strategy,
        monthly_hours=monthly_hours_strategy,
        pqr_dedication=pqr_dedication_strategy,
        factor=productivity_factor_strategy,
        load=load_strategy,
    )
    @settings(max_examples=100)
    def test_summary_data_provenance_always_derived(
        self,
        analysts: int,
        monthly_hours: float,
        pqr_dedication: float,
        factor: float,
        load: float,
    ):
        """The capacity summary data_provenance must always be DERIVED_DATA."""
        config = {
            "analysts": analysts,
            "monthly_hours_base": monthly_hours,
            "pqr_dedication": pqr_dedication,
            "productivity_factor": factor,
            "current_load": load,
        }

        summary = get_capacity_summary(config)

        assert (
            summary.data_provenance == "DERIVED_DATA"
        ), f"data_provenance '{summary.data_provenance}' != 'DERIVED_DATA'"
