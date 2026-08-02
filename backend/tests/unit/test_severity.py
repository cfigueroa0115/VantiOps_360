"""Unit tests for severity classification functions.

Tests both classification schemes:
1. Column null flagging: flag_column_severity()
2. Quality rule violations: classify_violation_severity()

Requirements: 3.5, 3.7, 10.2
"""

import pytest

from quality.models import SeverityLevel
from quality.severity import classify_violation_severity, flag_column_severity


# ---------- flag_column_severity tests (Requirements 3.5, 3.7) ----------


class TestFlagColumnSeverity:
    """Tests for the column null flagging classification scheme."""

    def test_above_20_percent_is_high(self):
        """Columns with >20% nulls should be flagged HIGH."""
        assert flag_column_severity(20.1) == SeverityLevel.HIGH
        assert flag_column_severity(50.0) == SeverityLevel.HIGH
        assert flag_column_severity(100.0) == SeverityLevel.HIGH

    def test_between_5_and_20_percent_is_medium(self):
        """Columns with 5% to 20% nulls should be flagged MEDIUM."""
        assert flag_column_severity(5.0) == SeverityLevel.MEDIUM
        assert flag_column_severity(10.0) == SeverityLevel.MEDIUM
        assert flag_column_severity(20.0) == SeverityLevel.MEDIUM

    def test_below_5_percent_is_low(self):
        """Columns with <5% nulls should be flagged LOW."""
        assert flag_column_severity(4.99) == SeverityLevel.LOW
        assert flag_column_severity(0.0) == SeverityLevel.LOW
        assert flag_column_severity(1.0) == SeverityLevel.LOW

    def test_boundary_at_5_percent(self):
        """Exactly 5% should be MEDIUM (5-20% range is inclusive of 5%)."""
        assert flag_column_severity(5.0) == SeverityLevel.MEDIUM

    def test_boundary_at_20_percent(self):
        """Exactly 20% should be MEDIUM (5-20% range is inclusive of 20%)."""
        assert flag_column_severity(20.0) == SeverityLevel.MEDIUM

    def test_boundary_just_above_20(self):
        """Just above 20% should be HIGH."""
        assert flag_column_severity(20.01) == SeverityLevel.HIGH

    def test_boundary_just_below_5(self):
        """Just below 5% should be LOW."""
        assert flag_column_severity(4.99) == SeverityLevel.LOW

    def test_zero_percent(self):
        """Zero nulls should be LOW."""
        assert flag_column_severity(0.0) == SeverityLevel.LOW


# ---------- classify_violation_severity tests (Requirement 10.2) ----------


class TestClassifyViolationSeverity:
    """Tests for the quality rule violation classification scheme."""

    def test_above_20_percent_is_critical(self):
        """Violations >20% should be CRITICAL."""
        assert classify_violation_severity(20.1) == SeverityLevel.CRITICAL
        assert classify_violation_severity(50.0) == SeverityLevel.CRITICAL
        assert classify_violation_severity(100.0) == SeverityLevel.CRITICAL

    def test_above_10_to_20_percent_is_high(self):
        """Violations >10% to 20% should be HIGH."""
        assert classify_violation_severity(10.1) == SeverityLevel.HIGH
        assert classify_violation_severity(15.0) == SeverityLevel.HIGH
        assert classify_violation_severity(20.0) == SeverityLevel.HIGH

    def test_above_5_to_10_percent_is_medium(self):
        """Violations >5% to 10% should be MEDIUM."""
        assert classify_violation_severity(5.1) == SeverityLevel.MEDIUM
        assert classify_violation_severity(7.5) == SeverityLevel.MEDIUM
        assert classify_violation_severity(10.0) == SeverityLevel.MEDIUM

    def test_at_or_below_5_percent_is_low(self):
        """Violations ≤5% should be LOW."""
        assert classify_violation_severity(5.0) == SeverityLevel.LOW
        assert classify_violation_severity(3.0) == SeverityLevel.LOW
        assert classify_violation_severity(0.0) == SeverityLevel.LOW

    def test_boundary_at_20_percent(self):
        """Exactly 20% should be HIGH (not CRITICAL, since threshold is >20%)."""
        assert classify_violation_severity(20.0) == SeverityLevel.HIGH

    def test_boundary_just_above_20(self):
        """Just above 20% should be CRITICAL."""
        assert classify_violation_severity(20.01) == SeverityLevel.CRITICAL

    def test_boundary_at_10_percent(self):
        """Exactly 10% should be MEDIUM (not HIGH, since threshold is >10%)."""
        assert classify_violation_severity(10.0) == SeverityLevel.MEDIUM

    def test_boundary_just_above_10(self):
        """Just above 10% should be HIGH."""
        assert classify_violation_severity(10.01) == SeverityLevel.HIGH

    def test_boundary_at_5_percent(self):
        """Exactly 5% should be LOW (≤5% is LOW)."""
        assert classify_violation_severity(5.0) == SeverityLevel.LOW

    def test_boundary_just_above_5(self):
        """Just above 5% should be MEDIUM."""
        assert classify_violation_severity(5.01) == SeverityLevel.MEDIUM

    def test_zero_percent(self):
        """Zero violations should be LOW."""
        assert classify_violation_severity(0.0) == SeverityLevel.LOW


# ---------- Consistency with SeverityLevel.from_percentage() ----------


class TestConsistencyWithFromPercentage:
    """Verify classify_violation_severity matches SeverityLevel.from_percentage."""

    @pytest.mark.parametrize("pct", [0, 2.5, 5.0, 5.1, 10.0, 10.1, 15.0, 20.0, 20.1, 50.0, 100.0])
    def test_matches_from_percentage(self, pct: float):
        """classify_violation_severity should produce same result as from_percentage."""
        assert classify_violation_severity(pct) == SeverityLevel.from_percentage(pct)
