"""
Capacity Model module for VantiOps 360.

Implements configurable capacity planning for PQR analysts operating
at 20% dedication. Provides formulas for net capacity calculation,
utilization tracking, and alert level determination.

Formula:
    netCapacity = hours × productivityFactor

Utilization:
    utilization = (currentLoad / netCapacity) × 100  (percentage 0-100+)

Alert Levels (based on utilization percentage, per design Section 24):
    - green:  ≤ 85%   (controlada — operación normal)
    - yellow: > 85% and ≤ 100%  (en riesgo — monitoreo cercano)
    - orange: > 100% and ≤ 120% (sobrecarga — redistribución)
    - red:    > 120%  (escalamiento crítico — notificación OPERATIONS_LEAD)

Data Provenance: DERIVED_DATA

Requirements:
    - REQ-20.1: Configurable capacity model with formula enforcement
    - REQ-20.2: Utilization calculation considering demand factors
    - REQ-20.3: Alert generation based on configurable thresholds
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# ---------------------------------------------------------------------------
# Constants (configurable defaults)
# ---------------------------------------------------------------------------

MONTHLY_HOURS_BASE: float = 160.0
"""Default monthly working hours per analyst."""

PQR_DEDICATION: float = 0.20
"""Default PQR dedication factor (20% of time)."""

DEFAULT_PRODUCTIVITY_FACTOR: float = 0.85
"""Default productivity factor accounting for breaks, meetings, etc."""

# Alert thresholds (utilization percentages) — per design Section 24
ALERT_THRESHOLD_GREEN_MAX: float = 85.0
ALERT_THRESHOLD_YELLOW_MAX: float = 100.0
ALERT_THRESHOLD_ORANGE_MAX: float = 120.0
# Red: above 120%

AlertLevel = Literal["green", "yellow", "orange", "red"]


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CapacitySummary:
    """Summary of capacity metrics for a team configuration.

    Attributes:
        total_analysts: Number of analysts in the team.
        monthly_hours_base: Base monthly hours per analyst.
        pqr_dedication: Fraction of time dedicated to PQR (0-1).
        productivity_factor: Productivity multiplier (0-1].
        available_hours: Total available hours (analysts × base × dedication).
        net_capacity: Net capacity after productivity factor.
        current_load: Current demand/load in hours.
        utilization: Utilization percentage (0-100+).
        alert_level: Alert level based on utilization thresholds.
        data_provenance: Always "DERIVED_DATA".
    """

    total_analysts: int
    monthly_hours_base: float
    pqr_dedication: float
    productivity_factor: float
    available_hours: float
    net_capacity: float
    current_load: float
    utilization: float
    alert_level: AlertLevel
    data_provenance: str = field(default="DERIVED_DATA", init=False)


@dataclass(frozen=True)
class TeamConfig:
    """Configuration for a team's capacity calculation.

    Attributes:
        name: Team identifier/name.
        analysts: Number of analysts assigned.
        monthly_hours_base: Base monthly working hours per analyst.
        pqr_dedication: Fraction of work time dedicated to PQR (0-1).
        productivity_factor: Productivity multiplier (0 < factor ≤ 1).
        current_load: Current demand in hours.
    """

    name: str
    analysts: int
    monthly_hours_base: float = MONTHLY_HOURS_BASE
    pqr_dedication: float = PQR_DEDICATION
    productivity_factor: float = DEFAULT_PRODUCTIVITY_FACTOR
    current_load: float = 0.0


# ---------------------------------------------------------------------------
# Core Functions
# ---------------------------------------------------------------------------


def calculate_net_capacity(hours: float, productivity_factor: float) -> float:
    """Calculate net capacity using the core formula.

    Formula: netCapacity = hours × productivityFactor

    Args:
        hours: Available hours (must be non-negative).
        productivity_factor: Productivity multiplier (must be > 0 and ≤ 1).

    Returns:
        Net capacity in hours.

    Raises:
        ValueError: If hours is negative or productivity_factor is not in (0, 1].

    Examples:
        >>> calculate_net_capacity(32.0, 0.85)
        27.2
        >>> calculate_net_capacity(160.0, 1.0)
        160.0
        >>> calculate_net_capacity(0.0, 0.85)
        0.0
    """
    if hours < 0:
        raise ValueError(f"hours must be non-negative, got {hours}")
    if productivity_factor <= 0 or productivity_factor > 1:
        raise ValueError(f"productivity_factor must be in (0, 1], got {productivity_factor}")

    return hours * productivity_factor


def calculate_utilization(current_load: float, net_capacity: float) -> float:
    """Calculate utilization as a percentage.

    Formula: utilization = (currentLoad / netCapacity) × 100

    Args:
        current_load: Current demand in hours (must be non-negative).
        net_capacity: Net available capacity in hours (must be positive).

    Returns:
        Utilization percentage (0-100+). Can exceed 100% if overloaded.

    Raises:
        ValueError: If current_load is negative or net_capacity is not positive.

    Examples:
        >>> calculate_utilization(16.0, 27.2)
        58.82352941176471
        >>> calculate_utilization(27.2, 27.2)
        100.0
        >>> calculate_utilization(0.0, 27.2)
        0.0
    """
    if current_load < 0:
        raise ValueError(f"current_load must be non-negative, got {current_load}")
    if net_capacity <= 0:
        raise ValueError(f"net_capacity must be positive, got {net_capacity}")

    return (current_load / net_capacity) * 100.0


def get_alert_level(utilization: float) -> AlertLevel:
    """Determine the alert level based on utilization percentage.

    Thresholds (per design Section 24):
        - green:  ≤ 85%   (controlada — operación normal)
        - yellow: > 85% and ≤ 100%  (en riesgo — monitoreo cercano)
        - orange: > 100% and ≤ 120% (sobrecarga — redistribución)
        - red:    > 120%  (escalamiento crítico)

    Args:
        utilization: Utilization percentage (0-100+).

    Returns:
        Alert level string: "green", "yellow", "orange", or "red".

    Raises:
        ValueError: If utilization is negative.

    Examples:
        >>> get_alert_level(50.0)
        'green'
        >>> get_alert_level(85.0)
        'green'
        >>> get_alert_level(86.0)
        'yellow'
        >>> get_alert_level(100.0)
        'yellow'
        >>> get_alert_level(101.0)
        'orange'
        >>> get_alert_level(120.0)
        'orange'
        >>> get_alert_level(121.0)
        'red'
        >>> get_alert_level(150.0)
        'red'
    """
    if utilization < 0:
        raise ValueError(f"utilization must be non-negative, got {utilization}")

    if utilization <= ALERT_THRESHOLD_GREEN_MAX:
        return "green"
    elif utilization <= ALERT_THRESHOLD_YELLOW_MAX:
        return "yellow"
    elif utilization <= ALERT_THRESHOLD_ORANGE_MAX:
        return "orange"
    else:
        return "red"


def get_capacity_summary(team_config: dict) -> CapacitySummary:
    """Compute a full capacity summary for a team configuration.

    Accepts a dictionary with team configuration parameters and returns
    a complete CapacitySummary with all derived metrics.

    Args:
        team_config: Dictionary with keys:
            - name (str): Team name (optional, defaults to "default").
            - analysts (int): Number of analysts (required, must be > 0).
            - monthly_hours_base (float): Base hours per month (optional, default 160).
            - pqr_dedication (float): PQR dedication factor 0-1 (optional, default 0.20).
            - productivity_factor (float): Productivity factor (0, 1] (optional, default 0.85).
            - current_load (float): Current demand in hours (optional, default 0).

    Returns:
        CapacitySummary with all computed metrics.

    Raises:
        ValueError: If required fields are missing or invalid.

    Examples:
        >>> config = {"analysts": 5, "productivity_factor": 0.85, "current_load": 100.0}
        >>> summary = get_capacity_summary(config)
        >>> summary.alert_level
        'red'
    """
    # Extract and validate configuration
    analysts = team_config.get("analysts")
    if analysts is None or not isinstance(analysts, (int, float)) or int(analysts) <= 0:
        raise ValueError("team_config must have 'analysts' as a positive integer")
    analysts = int(analysts)

    monthly_hours_base = float(team_config.get("monthly_hours_base", MONTHLY_HOURS_BASE))
    pqr_dedication = float(team_config.get("pqr_dedication", PQR_DEDICATION))
    productivity_factor = float(team_config.get("productivity_factor", DEFAULT_PRODUCTIVITY_FACTOR))
    current_load = float(team_config.get("current_load", 0.0))

    if monthly_hours_base < 0:
        raise ValueError(f"monthly_hours_base must be non-negative, got {monthly_hours_base}")
    if pqr_dedication < 0 or pqr_dedication > 1:
        raise ValueError(f"pqr_dedication must be in [0, 1], got {pqr_dedication}")
    if productivity_factor <= 0 or productivity_factor > 1:
        raise ValueError(f"productivity_factor must be in (0, 1], got {productivity_factor}")
    if current_load < 0:
        raise ValueError(f"current_load must be non-negative, got {current_load}")

    # Calculate derived metrics
    available_hours = analysts * monthly_hours_base * pqr_dedication
    net_capacity = calculate_net_capacity(available_hours, productivity_factor)

    # Handle edge case: if net_capacity is 0 (e.g., pqr_dedication=0), utilization is 0
    if net_capacity == 0:
        utilization = 0.0 if current_load == 0 else 100.0
    else:
        utilization = calculate_utilization(current_load, net_capacity)

    alert_level = get_alert_level(utilization)

    return CapacitySummary(
        total_analysts=analysts,
        monthly_hours_base=monthly_hours_base,
        pqr_dedication=pqr_dedication,
        productivity_factor=productivity_factor,
        available_hours=available_hours,
        net_capacity=net_capacity,
        current_load=current_load,
        utilization=utilization,
        alert_level=alert_level,
    )


def get_capacity_report(users: list[dict]) -> dict:
    """Generate an aggregate capacity report for a list of users.

    Computes per-user capacity metrics and aggregates team totals including
    net capacity, overall utilization, and alert level.

    Args:
        users: List of user dictionaries. Each dict should contain:
            - name (str): User/team name (optional, defaults to "unknown").
            - hours (float): Available hours for the user (required).
            - productivity_factor (float): Productivity multiplier (optional, default 0.85).
            - assigned_work (float): Hours of work currently assigned (optional, default 0).

    Returns:
        Dictionary with:
            - total_users (int): Number of users in the report.
            - total_net_capacity (float): Sum of net capacity across all users.
            - total_assigned_work (float): Sum of assigned work across all users.
            - overall_utilization (float): Aggregate utilization percentage.
            - overall_alert_level (str): Alert level based on overall utilization.
            - users (list[dict]): Per-user breakdown with computed metrics.
            - data_provenance (str): Always "DERIVED_DATA".

    Raises:
        ValueError: If users list is empty or any user has invalid data.

    Examples:
        >>> users = [
        ...     {"name": "Alice", "hours": 32.0, "productivity_factor": 0.85, "assigned_work": 20.0},
        ...     {"name": "Bob", "hours": 32.0, "productivity_factor": 0.85, "assigned_work": 10.0},
        ... ]
        >>> report = get_capacity_report(users)
        >>> report["total_users"]
        2
        >>> report["overall_alert_level"]
        'green'
    """
    if not users:
        raise ValueError("users list must not be empty")

    user_results: list[dict] = []
    total_net_capacity = 0.0
    total_assigned_work = 0.0

    for i, user in enumerate(users):
        name = user.get("name", f"user_{i}")
        hours = user.get("hours")
        if hours is None:
            raise ValueError(f"User '{name}' must have 'hours' field")
        hours = float(hours)
        if hours < 0:
            raise ValueError(f"User '{name}': hours must be non-negative, got {hours}")

        productivity_factor = float(user.get("productivity_factor", DEFAULT_PRODUCTIVITY_FACTOR))
        if productivity_factor <= 0 or productivity_factor > 1:
            raise ValueError(
                f"User '{name}': productivity_factor must be in (0, 1], got {productivity_factor}"
            )

        assigned_work = float(user.get("assigned_work", 0.0))
        if assigned_work < 0:
            raise ValueError(
                f"User '{name}': assigned_work must be non-negative, got {assigned_work}"
            )

        net_capacity = calculate_net_capacity(hours, productivity_factor)

        if net_capacity > 0:
            utilization = calculate_utilization(assigned_work, net_capacity)
        else:
            utilization = 0.0 if assigned_work == 0 else 100.0

        alert_level = get_alert_level(utilization)

        user_results.append(
            {
                "name": name,
                "hours": hours,
                "productivity_factor": productivity_factor,
                "net_capacity": net_capacity,
                "assigned_work": assigned_work,
                "utilization": utilization,
                "alert_level": alert_level,
            }
        )

        total_net_capacity += net_capacity
        total_assigned_work += assigned_work

    # Compute aggregate utilization
    if total_net_capacity > 0:
        overall_utilization = calculate_utilization(total_assigned_work, total_net_capacity)
    else:
        overall_utilization = 0.0 if total_assigned_work == 0 else 100.0

    overall_alert_level = get_alert_level(overall_utilization)

    return {
        "total_users": len(users),
        "total_net_capacity": total_net_capacity,
        "total_assigned_work": total_assigned_work,
        "overall_utilization": overall_utilization,
        "overall_alert_level": overall_alert_level,
        "users": user_results,
        "data_provenance": "DERIVED_DATA",
    }
