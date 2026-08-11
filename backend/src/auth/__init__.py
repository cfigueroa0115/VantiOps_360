"""
Authentication and authorization module for VantiOps 360.

Provides RBAC (Role-Based Access Control) with 11 roles from the Lista Maestra.
Requirements: REQ-13.1, REQ-13.2, REQ-13.6
"""

from auth.rbac import (
    PERMISSIONS,
    Permission,
    Role,
    get_allowed_permissions,
    is_authorized,
    validate_role,
)

__all__ = [
    "Role",
    "Permission",
    "PERMISSIONS",
    "is_authorized",
    "validate_role",
    "get_allowed_permissions",
]
