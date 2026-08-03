"""
Operational User Model module for VantiOps 360.

Implements the 42-user operational model supporting simultaneous assignment of:
  - 12 INTERN_READONLY users
  - 20 CONTRACTOR_OPERATOR users
  - 10 BUSINESS_OWNER users (previously BUSINESS_VIEWER in capacity terms)

Features:
  - Capacity checking per role
  - Automatic expiration enforcement for INTERN_READONLY and CONTRACTOR_OPERATOR
  - Audit logging of deactivation events on expiration

Data Provenance: REAL_DATA (users)

Requirements:
  - REQ-21.1: Support 42 simultaneous active users (12+20+10) without degradation
  - REQ-21.2: Differentiated permissions per role (INTERN, CONTRACTOR, BUSINESS)
  - REQ-21.4: Automatic expiration for INTERN_READONLY and CONTRACTOR_OPERATOR;
              BUSINESS_OWNER has no automatic expiration
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from audit.logger import log_audit_event

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_CAPACITY: dict[str, int] = {
    "INTERN_READONLY": 12,
    "CONTRACTOR_OPERATOR": 20,
    "BUSINESS_OWNER": 10,
}
"""Maximum simultaneous active users per role. Total = 42."""

TOTAL_CAPACITY: int = sum(USER_CAPACITY.values())
"""Total user capacity across all operational roles (42)."""

ROLES_WITH_EXPIRATION: set[str] = {"INTERN_READONLY", "CONTRACTOR_OPERATOR"}
"""Roles that MUST have an expires_at date set. BUSINESS_OWNER has no expiration."""


# ---------------------------------------------------------------------------
# Core Functions
# ---------------------------------------------------------------------------


def check_capacity(role: str, current_active: int) -> bool:
    """Check if there is room for one more user of the given role.

    Validates that adding one more active user of the specified role
    would not exceed the capacity limit for that role.

    Args:
        role: The role to check capacity for. Must be one of the keys
              in USER_CAPACITY.
        current_active: Number of currently active users with this role.
                       Must be non-negative.

    Returns:
        True if there is capacity for one more user, False otherwise.

    Raises:
        ValueError: If role is not in USER_CAPACITY or current_active is negative.

    Examples:
        >>> check_capacity("INTERN_READONLY", 10)
        True
        >>> check_capacity("INTERN_READONLY", 12)
        False
        >>> check_capacity("CONTRACTOR_OPERATOR", 19)
        True
        >>> check_capacity("CONTRACTOR_OPERATOR", 20)
        False
    """
    if role not in USER_CAPACITY:
        raise ValueError(
            f"Unknown role '{role}'. Valid roles: {list(USER_CAPACITY.keys())}"
        )
    if current_active < 0:
        raise ValueError(
            f"current_active must be non-negative, got {current_active}"
        )

    max_capacity = USER_CAPACITY[role]
    return current_active < max_capacity


def check_expiration(user_id: str, expires_at: datetime | None) -> bool:
    """Check if a user has expired based on their expires_at timestamp.

    Compares the user's expiration date against the current UTC time.

    Args:
        user_id: The user identifier (used for logging context).
        expires_at: The expiration datetime (timezone-aware UTC).
                   If None, the user never expires (valid for BUSINESS_OWNER).

    Returns:
        True if the user is expired (expires_at is in the past), False otherwise.
        Returns False if expires_at is None (no expiration).

    Raises:
        ValueError: If user_id is empty.

    Examples:
        >>> from datetime import datetime, timezone, timedelta
        >>> past = datetime.now(timezone.utc) - timedelta(days=1)
        >>> check_expiration("user-1", past)
        True
        >>> future = datetime.now(timezone.utc) + timedelta(days=30)
        >>> check_expiration("user-1", future)
        False
        >>> check_expiration("user-1", None)
        False
    """
    if not user_id:
        raise ValueError("user_id is required")

    if expires_at is None:
        return False

    now = datetime.now(timezone.utc)

    # Ensure expires_at is timezone-aware for comparison
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return now >= expires_at


def validate_expiration_required(role: str, expires_at: datetime | None) -> bool:
    """Validate that roles requiring expiration have expires_at set.

    INTERN_READONLY and CONTRACTOR_OPERATOR MUST have an expires_at date.
    BUSINESS_OWNER does NOT require (and should not have) an expiration date.

    Args:
        role: The user's role.
        expires_at: The expiration datetime or None.

    Returns:
        True if the expiration configuration is valid for the role.

    Examples:
        >>> from datetime import datetime, timezone, timedelta
        >>> future = datetime.now(timezone.utc) + timedelta(days=90)
        >>> validate_expiration_required("INTERN_READONLY", future)
        True
        >>> validate_expiration_required("INTERN_READONLY", None)
        False
        >>> validate_expiration_required("BUSINESS_OWNER", None)
        True
    """
    if role in ROLES_WITH_EXPIRATION:
        return expires_at is not None
    return True


def process_expirations(users: list[dict[str, Any]]) -> list[str]:
    """Process a list of users and deactivate those who have expired.

    For each user in the list:
    1. Checks if the user is active and has an expires_at date.
    2. If the user has expired, sets is_active to False.
    3. Logs a deactivation audit event for each expired user.

    Only INTERN_READONLY and CONTRACTOR_OPERATOR users are subject to
    automatic expiration (per REQ-21.4). BUSINESS_OWNER users are skipped
    even if they somehow have an expires_at set.

    Args:
        users: List of user dictionaries. Each dict must contain:
            - "user_id" (str): User identifier.
            - "role" (str): User's role.
            - "is_active" (bool): Whether the user is currently active.
            - "expires_at" (datetime | None): Expiration timestamp.
            Optional:
            - "email" (str): User email for audit details.

    Returns:
        List of user_id strings that were deactivated during this run.

    Raises:
        ValueError: If any user dict is missing required fields.

    Examples:
        >>> from datetime import datetime, timezone, timedelta
        >>> past = datetime.now(timezone.utc) - timedelta(days=1)
        >>> users = [
        ...     {"user_id": "u1", "role": "INTERN_READONLY", "is_active": True, "expires_at": past},
        ...     {"user_id": "u2", "role": "BUSINESS_OWNER", "is_active": True, "expires_at": None},
        ... ]
        >>> deactivated = process_expirations(users)
        >>> "u1" in deactivated
        True
        >>> "u2" in deactivated
        False
    """
    deactivated_ids: list[str] = []

    for user in users:
        # Validate required fields
        user_id = user.get("user_id")
        role = user.get("role")
        is_active = user.get("is_active")
        expires_at = user.get("expires_at")

        if not user_id:
            raise ValueError("Each user must have a 'user_id' field")
        if role is None:
            raise ValueError(f"User '{user_id}' must have a 'role' field")
        if is_active is None:
            raise ValueError(f"User '{user_id}' must have an 'is_active' field")

        # Skip already inactive users
        if not is_active:
            continue

        # Only process roles that are subject to automatic expiration
        if role not in ROLES_WITH_EXPIRATION:
            continue

        # Check if expired
        if expires_at is not None and check_expiration(user_id, expires_at):
            # Deactivate the user
            user["is_active"] = False
            deactivated_ids.append(user_id)

            # Log audit event for the deactivation
            log_audit_event(
                user_id="SYSTEM",
                action="USER_EXPIRED",
                resource="app_users",
                resource_id=user_id,
                result="success",
                details={
                    "deactivated_user_id": user_id,
                    "role": role,
                    "expires_at": expires_at.isoformat() if isinstance(expires_at, datetime) else str(expires_at),
                    "reason": "automatic_expiration",
                    "email": user.get("email"),
                },
            )

            logger.info(
                "User %s (role=%s) deactivated due to expiration at %s",
                user_id, role, expires_at,
            )

    return deactivated_ids
