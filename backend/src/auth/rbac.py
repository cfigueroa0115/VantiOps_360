"""
RBAC (Role-Based Access Control) module for VantiOps 360.

Implements the 11-role permission system from the Lista Maestra,
with a permission matrix mapping roles to allowed actions/endpoints.

Requirements:
  - REQ-13.1: Implement all 11 roles with associated permissions.
  - REQ-13.2: Exactly one active role per user; restrict access per permission matrix.
  - REQ-13.6: Users without a role are denied all protected resources.

Roles (Lista Maestra):
  SYSTEM_ADMIN, OPERATIONS_LEAD, ANALYST, LEGAL_APPROVER, VP_APPROVER,
  BUSINESS_OWNER, AUDITOR, PARTNER_ADMIN, PARTNER_OPERATOR,
  CONTRACTOR_OPERATOR, INTERN_READONLY
"""

from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    """The 11 roles defined in the Lista Maestra de Roles."""

    SYSTEM_ADMIN = "SYSTEM_ADMIN"
    OPERATIONS_LEAD = "OPERATIONS_LEAD"
    ANALYST = "ANALYST"
    LEGAL_APPROVER = "LEGAL_APPROVER"
    VP_APPROVER = "VP_APPROVER"
    BUSINESS_OWNER = "BUSINESS_OWNER"
    AUDITOR = "AUDITOR"
    PARTNER_ADMIN = "PARTNER_ADMIN"
    PARTNER_OPERATOR = "PARTNER_OPERATOR"
    CONTRACTOR_OPERATOR = "CONTRACTOR_OPERATOR"
    INTERN_READONLY = "INTERN_READONLY"


class Permission(StrEnum):
    """Permission codes used in the RBAC matrix.

    Categories:
      - Basic read: READ_DASHBOARD, READ_CHARTS, READ_KPIS, READ_FILTERS
      - Analytics: READ_RCA, READ_QUALITY, READ_RISK, READ_STATISTICS
      - Reporting: READ_REPORTS, EXPORT_DATA
      - Annulations: READ_ANNULATIONS, CREATE_ANNULATION, APPROVE_ANNULATION
      - Capacity: READ_CAPACITY, MANAGE_CAPACITY
      - Audit: READ_AUDIT, READ_EVIDENCE
      - Approvals: APPROVE_LEGAL, APPROVE_VP
      - Admin: MANAGE_USERS, MANAGE_ROLES, MANAGE_CONFIG
      - Data ingestion: INGEST_DATA
      - Partner management: MANAGE_OWN_PARTNER
    """

    # Basic read
    READ_DASHBOARD = "READ_DASHBOARD"
    READ_CHARTS = "READ_CHARTS"
    READ_KPIS = "READ_KPIS"
    READ_FILTERS = "READ_FILTERS"

    # Analytics
    READ_RCA = "READ_RCA"
    READ_QUALITY = "READ_QUALITY"
    READ_RISK = "READ_RISK"
    READ_STATISTICS = "READ_STATISTICS"

    # Reporting
    READ_REPORTS = "READ_REPORTS"
    EXPORT_DATA = "EXPORT_DATA"

    # Annulations
    READ_ANNULATIONS = "READ_ANNULATIONS"
    CREATE_ANNULATION = "CREATE_ANNULATION"
    APPROVE_ANNULATION = "APPROVE_ANNULATION"

    # Capacity
    READ_CAPACITY = "READ_CAPACITY"
    MANAGE_CAPACITY = "MANAGE_CAPACITY"

    # Audit
    READ_AUDIT = "READ_AUDIT"
    READ_EVIDENCE = "READ_EVIDENCE"

    # Approvals
    APPROVE_LEGAL = "APPROVE_LEGAL"
    APPROVE_VP = "APPROVE_VP"

    # Admin
    MANAGE_USERS = "MANAGE_USERS"
    MANAGE_ROLES = "MANAGE_ROLES"
    MANAGE_CONFIG = "MANAGE_CONFIG"

    # Data ingestion
    INGEST_DATA = "INGEST_DATA"

    # Partner management
    MANAGE_OWN_PARTNER = "MANAGE_OWN_PARTNER"


# ---------------------------------------------------------------------------
# Permission Matrix: maps each role to its set of allowed permissions.
# Aligned with database migration 005_create_role_permissions.sql
# ---------------------------------------------------------------------------

_ALL_PERMISSIONS: frozenset[Permission] = frozenset(Permission)

_BASIC_READ: frozenset[Permission] = frozenset(
    [
        Permission.READ_DASHBOARD,
        Permission.READ_CHARTS,
        Permission.READ_KPIS,
        Permission.READ_FILTERS,
    ]
)

PERMISSIONS: dict[Role, frozenset[Permission]] = {
    # SYSTEM_ADMIN: full access to all permissions
    Role.SYSTEM_ADMIN: _ALL_PERMISSIONS,
    # OPERATIONS_LEAD: read + analysis + reports + capacity + evidence
    Role.OPERATIONS_LEAD: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.READ_RISK,
            Permission.READ_STATISTICS,
            Permission.READ_REPORTS,
            Permission.EXPORT_DATA,
            Permission.READ_ANNULATIONS,
            Permission.READ_CAPACITY,
            Permission.MANAGE_CAPACITY,
            Permission.READ_EVIDENCE,
        ]
    ),
    # ANALYST: read + analysis + reports
    Role.ANALYST: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.READ_RISK,
            Permission.READ_STATISTICS,
            Permission.READ_REPORTS,
            Permission.EXPORT_DATA,
            Permission.READ_ANNULATIONS,
        ]
    ),
    # LEGAL_APPROVER: read + legal approvals + audit
    Role.LEGAL_APPROVER: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.READ_ANNULATIONS,
            Permission.APPROVE_LEGAL,
            Permission.APPROVE_ANNULATION,
            Permission.READ_AUDIT,
        ]
    ),
    # VP_APPROVER: read + VP approvals + audit
    Role.VP_APPROVER: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.READ_ANNULATIONS,
            Permission.APPROVE_VP,
            Permission.APPROVE_ANNULATION,
            Permission.READ_AUDIT,
        ]
    ),
    # BUSINESS_OWNER: read + reports + create annulation + capacity read
    Role.BUSINESS_OWNER: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.READ_REPORTS,
            Permission.EXPORT_DATA,
            Permission.READ_ANNULATIONS,
            Permission.CREATE_ANNULATION,
            Permission.READ_CAPACITY,
        ]
    ),
    # AUDITOR: read + audit logs + evidence
    Role.AUDITOR: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.READ_AUDIT,
            Permission.READ_EVIDENCE,
            Permission.READ_ANNULATIONS,
        ]
    ),
    # PARTNER_ADMIN: read + manage own partner organization
    Role.PARTNER_ADMIN: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.MANAGE_OWN_PARTNER,
        ]
    ),
    # PARTNER_OPERATOR: read + delegated operations
    Role.PARTNER_OPERATOR: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.READ_ANNULATIONS,
        ]
    ),
    # CONTRACTOR_OPERATOR: read + analysis + statistics
    Role.CONTRACTOR_OPERATOR: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.READ_STATISTICS,
        ]
    ),
    # INTERN_READONLY: read + data ingestion
    Role.INTERN_READONLY: _BASIC_READ
    | frozenset(
        [
            Permission.READ_RCA,
            Permission.READ_QUALITY,
            Permission.INGEST_DATA,
        ]
    ),
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_role(role: str) -> bool:
    """Check if a role string is a valid role from the Lista Maestra.

    Args:
        role: The role identifier to validate.

    Returns:
        True if the role is valid, False otherwise.

    Examples:
        >>> validate_role("SYSTEM_ADMIN")
        True
        >>> validate_role("DEVELOPER")
        False
        >>> validate_role("")
        False
    """
    try:
        Role(role)
        return True
    except ValueError:
        return False


def get_allowed_permissions(role: str) -> list[str]:
    """Get the list of permissions allowed for the given role.

    Args:
        role: A valid role identifier from the Lista Maestra.

    Returns:
        A sorted list of permission codes the role has access to.
        Returns an empty list if the role is invalid.

    Examples:
        >>> perms = get_allowed_permissions("INTERN_READONLY")
        >>> "READ_DASHBOARD" in perms
        True
        >>> "MANAGE_USERS" in perms
        False
    """
    if not validate_role(role):
        return []

    role_enum = Role(role)
    return sorted(p.value for p in PERMISSIONS[role_enum])


def is_authorized(role: str, permission: str) -> bool:
    """Check if a role is authorized to perform a given permission/action.

    Implements REQ-13.2: restrict access to endpoints and pages exclusively
    to the functionalities defined in the permission matrix for the assigned role.

    Implements REQ-13.6: users without a valid role are denied access to all
    protected resources.

    Args:
        role: The user's active role (must be a valid role from Lista Maestra).
        permission: The permission code being requested (e.g., "READ_DASHBOARD").

    Returns:
        True if the role has the specified permission, False otherwise.
        Returns False if the role is invalid or the permission is unknown.

    Examples:
        >>> is_authorized("SYSTEM_ADMIN", "MANAGE_USERS")
        True
        >>> is_authorized("INTERN_READONLY", "MANAGE_USERS")
        False
        >>> is_authorized("INVALID_ROLE", "READ_DASHBOARD")
        False
        >>> is_authorized("ANALYST", "UNKNOWN_PERMISSION")
        False
    """
    # Invalid role → deny all (REQ-13.6)
    if not validate_role(role):
        return False

    # Unknown permission → deny
    try:
        perm_enum = Permission(permission)
    except ValueError:
        return False

    role_enum = Role(role)
    return perm_enum in PERMISSIONS[role_enum]


def validate_single_role_assignment(current_roles: list[str]) -> bool:
    """Validate that a user has at most 1 active role (REQ-13.2).

    This function enforces the constraint that each user has exactly one
    active role. It returns True if the assignment is valid (0 or 1 roles),
    and False if the user has multiple roles assigned.

    Args:
        current_roles: List of role identifiers currently assigned to a user.

    Returns:
        True if 0 or 1 valid roles are assigned, False if more than 1.

    Examples:
        >>> validate_single_role_assignment(["ANALYST"])
        True
        >>> validate_single_role_assignment([])
        True
        >>> validate_single_role_assignment(["ANALYST", "AUDITOR"])
        False
    """
    valid_roles = [r for r in current_roles if validate_role(r)]
    return len(valid_roles) <= 1
