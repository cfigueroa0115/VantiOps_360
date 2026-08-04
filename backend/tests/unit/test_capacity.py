"""Unit tests for operations.capacity module.

Tests the capacity model including net capacity calculation,
utilization tracking, alert level determination, and summary generation.

Requirements: 20.1, 20.2, 20.3
"""

from __future__ import annotations

import pytest

from operations.capacity import (
    ALERT_THRESHOLD_GREEN_MAX,
    ALERT_THRESHOLD_ORANGE_MAX,
    ALERT_THRESHOLD_YELLOW_MAX,
    DEFAULT_PRODUCTIVITY_FACTOR,
    MONTHLY_HOURS_BASE,
    PQR_DEDICATION,
    calculate_net_capacity,
    calculate_utilization,
    get_alert_level,
    get_capacity_report,
    get_capacity_summary,
)


class TestCalculateNetCapacity:
    """Tests for calculate_net_capacity (REQ-20.1)."""

    def test_basic_calculation(self):
        """Net capacity = hours × productivityFactor."""
        result = calculate_net_capacity(32.0, 0.85)
        assert result == pytest.approx(27.2)

    def test_full_productivity(self):
        """With factor 1.0, net capacity equals available hours."""
        result = calculate_net_capacity(160.0, 1.0)
        assert result == 160.0

    def test_zero_hours(self):
        """Zero hours yields zero capacity."""
        result = calculate_net_capacity(0.0, 0.85)
        assert result == 0.0

    def test_low_productivity(self):
        """Low productivity factor reduces capacity proportionally."""
        result = calculate_net_capacity(100.0, 0.5)
        assert result == pytest.approx(50.0)

    def test_negative_hours_raises(self):
        """Negative hours should raise ValueError."""
        with pytest.raises(ValueError, match="hours must be non-negative"):
            calculate_net_capacity(-1.0, 0.85)

    def test_zero_productivity_factor_raises(self):
        """Zero productivity factor should raise ValueError."""
        with pytest.raises(ValueError, match="productivity_factor must be in"):
            calculate_net_capacity(32.0, 0.0)

    def test_negative_productivity_factor_raises(self):
        """Negative productivity factor should raise ValueError."""
        with pytest.raises(ValueError, match="productivity_factor must be in"):
            calculate_net_capacity(32.0, -0.5)

    def test_productivity_factor_above_one_raises(self):
        """Productivity factor above 1.0 should raise ValueError."""
        with pytest.raises(ValueError, match="productivity_factor must be in"):
            calculate_net_capacity(32.0, 1.5)


class TestCalculateUtilization:
    """Tests for calculate_utilization (REQ-20.2)."""

    def test_zero_load(self):
        """Zero load means 0% utilization."""
        result = calculate_utilization(0.0, 27.2)
        assert result == 0.0

    def test_full_utilization(self):
        """Load equals capacity means 100% utilization."""
        result = calculate_utilization(27.2, 27.2)
        assert result == pytest.approx(100.0)

    def test_partial_utilization(self):
        """Partial load gives proportional utilization."""
        result = calculate_utilization(16.0, 32.0)
        assert result == pytest.approx(50.0)

    def test_over_capacity(self):
        """Load exceeding capacity gives > 100%."""
        result = calculate_utilization(40.0, 27.2)
        assert result > 100.0

    def test_negative_load_raises(self):
        """Negative load should raise ValueError."""
        with pytest.raises(ValueError, match="current_load must be non-negative"):
            calculate_utilization(-1.0, 27.2)

    def test_zero_capacity_raises(self):
        """Zero capacity should raise ValueError."""
        with pytest.raises(ValueError, match="net_capacity must be positive"):
            calculate_utilization(10.0, 0.0)

    def test_negative_capacity_raises(self):
        """Negative capacity should raise ValueError."""
        with pytest.raises(ValueError, match="net_capacity must be positive"):
            calculate_utilization(10.0, -5.0)


class TestGetAlertLevel:
    """Tests for get_alert_level (REQ-20.3)."""

    def test_green_at_zero(self):
        """0% utilization is green."""
        assert get_alert_level(0.0) == "green"

    def test_green_at_threshold(self):
        """Exactly 85% is still green."""
        assert get_alert_level(85.0) == "green"

    def test_yellow_just_above_green(self):
        """Just above 85% is yellow."""
        assert get_alert_level(85.1) == "yellow"

    def test_yellow_at_threshold(self):
        """Exactly 100% is still yellow."""
        assert get_alert_level(100.0) == "yellow"

    def test_orange_just_above_yellow(self):
        """Just above 100% is orange."""
        assert get_alert_level(100.1) == "orange"

    def test_orange_at_threshold(self):
        """Exactly 120% is still orange."""
        assert get_alert_level(120.0) == "orange"

    def test_red_just_above_orange(self):
        """Just above 120% is red."""
        assert get_alert_level(120.1) == "red"

    def test_red_at_150(self):
        """150% utilization is red."""
        assert get_alert_level(150.0) == "red"

    def test_red_over_200(self):
        """Over 200% (heavily overloaded) is red."""
        assert get_alert_level(200.0) == "red"

    def test_negative_raises(self):
        """Negative utilization should raise ValueError."""
        with pytest.raises(ValueError, match="utilization must be non-negative"):
            get_alert_level(-1.0)


class TestGetCapacitySummary:
    """Tests for get_capacity_summary (REQ-20.1, 20.2, 20.3)."""

    def test_basic_summary(self):
        """Basic team configuration produces valid summary."""
        config = {
            "analysts": 5,
            "monthly_hours_base": 160.0,
            "pqr_dedication": 0.20,
            "productivity_factor": 0.85,
            "current_load": 10.0,
        }
        summary = get_capacity_summary(config)

        assert summary.total_analysts == 5
        assert summary.monthly_hours_base == 160.0
        assert summary.pqr_dedication == 0.20
        assert summary.productivity_factor == 0.85
        # available_hours = 5 × 160 × 0.20 = 160.0
        assert summary.available_hours == pytest.approx(160.0)
        # net_capacity = 160.0 × 0.85 = 136.0
        assert summary.net_capacity == pytest.approx(136.0)
        assert summary.current_load == 10.0
        # utilization = (10 / 136) × 100 ≈ 7.35%
        assert summary.utilization == pytest.approx(7.352941176470588)
        assert summary.alert_level == "green"
        assert summary.data_provenance == "DERIVED_DATA"

    def test_high_load_red_alert(self):
        """High load triggers red alert."""
        config = {
            "analysts": 2,
            "productivity_factor": 0.85,
            "current_load": 100.0,
        }
        summary = get_capacity_summary(config)

        # available_hours = 2 × 160 × 0.20 = 64
        # net_capacity = 64 × 0.85 = 54.4
        # utilization = (100 / 54.4) × 100 ≈ 183.8%
        assert summary.utilization > 120.0
        assert summary.alert_level == "red"

    def test_defaults_applied(self):
        """Default values are applied when optional fields are missing."""
        config = {"analysts": 3, "current_load": 5.0}
        summary = get_capacity_summary(config)

        assert summary.monthly_hours_base == MONTHLY_HOURS_BASE
        assert summary.pqr_dedication == PQR_DEDICATION
        assert summary.productivity_factor == DEFAULT_PRODUCTIVITY_FACTOR

    def test_zero_load_green(self):
        """Zero load always gives green."""
        config = {"analysts": 10, "current_load": 0.0}
        summary = get_capacity_summary(config)

        assert summary.utilization == 0.0
        assert summary.alert_level == "green"

    def test_missing_analysts_raises(self):
        """Missing analysts key raises ValueError."""
        with pytest.raises(ValueError, match="analysts"):
            get_capacity_summary({"current_load": 10.0})

    def test_zero_analysts_raises(self):
        """Zero analysts raises ValueError."""
        with pytest.raises(ValueError, match="analysts"):
            get_capacity_summary({"analysts": 0, "current_load": 10.0})

    def test_negative_analysts_raises(self):
        """Negative analysts raises ValueError."""
        with pytest.raises(ValueError, match="analysts"):
            get_capacity_summary({"analysts": -1, "current_load": 10.0})

    def test_invalid_productivity_factor_raises(self):
        """Invalid productivity factor raises ValueError."""
        with pytest.raises(ValueError, match="productivity_factor"):
            get_capacity_summary({"analysts": 5, "productivity_factor": 1.5})

    def test_negative_load_raises(self):
        """Negative current_load raises ValueError."""
        with pytest.raises(ValueError, match="current_load"):
            get_capacity_summary({"analysts": 5, "current_load": -10.0})

    def test_summary_is_frozen(self):
        """CapacitySummary is immutable."""
        config = {"analysts": 5, "current_load": 10.0}
        summary = get_capacity_summary(config)

        with pytest.raises(Exception):
            summary.total_analysts = 10  # type: ignore[misc]


class TestConstants:
    """Tests for module constants."""

    def test_monthly_hours_base(self):
        """Monthly hours base is 160."""
        assert MONTHLY_HOURS_BASE == 160.0

    def test_pqr_dedication(self):
        """PQR dedication is 20%."""
        assert PQR_DEDICATION == 0.20

    def test_default_productivity_factor(self):
        """Default productivity factor is 0.85."""
        assert DEFAULT_PRODUCTIVITY_FACTOR == 0.85

    def test_alert_thresholds_ascending(self):
        """Alert thresholds are in ascending order."""
        assert ALERT_THRESHOLD_GREEN_MAX < ALERT_THRESHOLD_YELLOW_MAX
        assert ALERT_THRESHOLD_YELLOW_MAX < ALERT_THRESHOLD_ORANGE_MAX


class TestGetCapacityReport:
    """Tests for get_capacity_report (REQ-20.1, 20.2, 20.3)."""

    def test_basic_report(self):
        """Basic multi-user report produces correct aggregates."""
        users = [
            {"name": "Alice", "hours": 32.0, "productivity_factor": 0.85, "assigned_work": 20.0},
            {"name": "Bob", "hours": 32.0, "productivity_factor": 0.85, "assigned_work": 10.0},
        ]
        report = get_capacity_report(users)

        assert report["total_users"] == 2
        # net_capacity per user = 32 * 0.85 = 27.2
        assert report["total_net_capacity"] == pytest.approx(54.4)
        assert report["total_assigned_work"] == pytest.approx(30.0)
        # overall_utilization = (30 / 54.4) * 100 ≈ 55.15%
        assert report["overall_utilization"] == pytest.approx(55.14705882352941)
        assert report["overall_alert_level"] == "green"
        assert report["data_provenance"] == "DERIVED_DATA"
        assert len(report["users"]) == 2

    def test_per_user_breakdown(self):
        """Each user in the report has correct individual metrics."""
        users = [
            {"name": "Alice", "hours": 32.0, "productivity_factor": 0.85, "assigned_work": 27.2},
        ]
        report = get_capacity_report(users)

        user = report["users"][0]
        assert user["name"] == "Alice"
        assert user["net_capacity"] == pytest.approx(27.2)
        assert user["assigned_work"] == 27.2
        # utilization = (27.2 / 27.2) * 100 = 100%
        assert user["utilization"] == pytest.approx(100.0)
        assert user["alert_level"] == "yellow"

    def test_overloaded_user(self):
        """User with assigned work exceeding capacity triggers red alert."""
        users = [
            {
                "name": "Overloaded",
                "hours": 32.0,
                "productivity_factor": 0.85,
                "assigned_work": 40.0,
            },
        ]
        report = get_capacity_report(users)

        user = report["users"][0]
        # utilization = (40 / 27.2) * 100 ≈ 147%
        assert user["utilization"] > 120.0
        assert user["alert_level"] == "red"

    def test_empty_users_raises(self):
        """Empty users list raises ValueError."""
        with pytest.raises(ValueError, match="users list must not be empty"):
            get_capacity_report([])

    def test_missing_hours_raises(self):
        """User without hours field raises ValueError."""
        with pytest.raises(ValueError, match="must have 'hours' field"):
            get_capacity_report([{"name": "NoHours", "assigned_work": 5.0}])

    def test_negative_hours_raises(self):
        """User with negative hours raises ValueError."""
        with pytest.raises(ValueError, match="hours must be non-negative"):
            get_capacity_report([{"name": "Bad", "hours": -1.0}])

    def test_invalid_productivity_factor_raises(self):
        """User with invalid productivity factor raises ValueError."""
        with pytest.raises(ValueError, match="productivity_factor must be in"):
            get_capacity_report([{"name": "Bad", "hours": 32.0, "productivity_factor": 1.5}])

    def test_default_productivity_factor(self):
        """Default productivity factor is applied when not specified."""
        users = [{"name": "Default", "hours": 32.0, "assigned_work": 5.0}]
        report = get_capacity_report(users)

        user = report["users"][0]
        assert user["productivity_factor"] == DEFAULT_PRODUCTIVITY_FACTOR
        assert user["net_capacity"] == pytest.approx(32.0 * DEFAULT_PRODUCTIVITY_FACTOR)

    def test_zero_assigned_work(self):
        """Zero assigned work gives 0% utilization and green alert."""
        users = [{"name": "Idle", "hours": 32.0, "assigned_work": 0.0}]
        report = get_capacity_report(users)

        assert report["overall_utilization"] == 0.0
        assert report["overall_alert_level"] == "green"

    def test_multiple_users_aggregate(self):
        """Multiple users correctly aggregate totals."""
        users = [
            {"name": "A", "hours": 32.0, "productivity_factor": 1.0, "assigned_work": 10.0},
            {"name": "B", "hours": 32.0, "productivity_factor": 1.0, "assigned_work": 20.0},
            {"name": "C", "hours": 32.0, "productivity_factor": 1.0, "assigned_work": 30.0},
        ]
        report = get_capacity_report(users)

        assert report["total_users"] == 3
        assert report["total_net_capacity"] == pytest.approx(96.0)
        assert report["total_assigned_work"] == pytest.approx(60.0)
        # utilization = (60 / 96) * 100 = 62.5%
        assert report["overall_utilization"] == pytest.approx(62.5)
        assert report["overall_alert_level"] == "green"
