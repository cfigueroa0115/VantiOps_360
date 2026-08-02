"""Severity classification for column null flagging and quality rule violations.

Provides two distinct classification schemes:

1. Column null flagging (Requirements 3.5, 3.7):
   - >20% null → HIGH (column requires attention)
   - 5% to 20% null → MEDIUM
   - <5% null → LOW

2. Quality rule violation severity (Requirement 10.2):
   - >20% violations → CRITICAL
   - >10% to 20% violations → HIGH
   - >5% to 10% violations → MEDIUM
   - ≤5% violations → LOW

Requirements: 3.5, 3.7, 10.2
"""

from __future__ import annotations

from quality.models import SeverityLevel


def flag_column_severity(null_percentage: float) -> SeverityLevel:
    """Classify column severity based on null percentage.

    Uses the column null flagging scheme from Requirements 3.5 and 3.7:
    - >20% null → HIGH (column requires attention)
    - 5% to 20% null (inclusive of 5% and 20%) → MEDIUM
    - <5% null → LOW

    Args:
        null_percentage: The percentage of null values in the column (0-100 scale).

    Returns:
        SeverityLevel.HIGH, MEDIUM, or LOW based on the null percentage.
    """
    if null_percentage > 20.0:
        return SeverityLevel.HIGH
    elif null_percentage >= 5.0:
        return SeverityLevel.MEDIUM
    else:
        return SeverityLevel.LOW


def classify_violation_severity(violation_percentage: float) -> SeverityLevel:
    """Classify severity based on quality rule violation percentage.

    Uses the quality rule violation scheme from Requirement 10.2:
    - >20% violations → CRITICAL
    - >10% to 20% violations → HIGH
    - >5% to 10% violations → MEDIUM
    - ≤5% violations → LOW

    This delegates to SeverityLevel.from_percentage() which implements
    the same threshold logic.

    Args:
        violation_percentage: The percentage of violations (0-100 scale).

    Returns:
        SeverityLevel.CRITICAL, HIGH, MEDIUM, or LOW based on violation percentage.
    """
    return SeverityLevel.from_percentage(violation_percentage)
