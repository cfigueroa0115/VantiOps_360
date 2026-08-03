"""
Property-based tests for RBAC access denial (Property 4).

**Validates: Requirements 13.3, 18.1**

Uses Hypothesis to verify:
- P4a: For any role NOT in the allowed set for a permission, is_authorized returns False
- P4b: For any role IN the allowed set, is_authorized returns True
- P4c: SYSTEM_ADMIN is authorized for all valid permissions
- P4d: Invalid role strings are never authorized
- P4e: Invalid permission strings are never authorized for any role
"""

from __future__ import annotations

import hypothesis.strategies as st
from hypothesis import given, settings, assume

from auth.rbac import (
    Role,
    Permission,
    PERMISSIONS,
    is_authorized,
    validate_role,
)


# --- Strategies ---

# All valid role strings
valid_roles = st.sampled_from([r.value for r in Role])

# All valid permission strings
valid_permissions = st.sampled_from([p.value for p in Permission])

# Invalid role strings: text that is NOT a valid role
invalid_roles = st.text(min_size=1, max_size=50).filter(
    lambda s: s not in {r.value for r in Role}
)

# Invalid permission strings: text that is NOT a valid permission
invalid_permissions = st.text(min_size=1, max_size=50).filter(
    lambda s: s not in {p.value for p in Permission}
)


# --- Helper ---

def _get_allowed_roles_for_permission(permission: Permission) -> set[str]:
    """Return the set of roles that have the given permission."""
    return {
        role.value
        for role, perms in PERMISSIONS.items()
        if permission in perms
    }


def _get_denied_roles_for_permission(permission: Permission) -> set[str]:
    """Return the set of roles that do NOT have the given permission."""
    all_roles = {r.value for r in Role}
    allowed = _get_allowed_roles_for_permission(permission)
    return all_roles - allowed


# --- Property Tests ---


class TestP4aUnauthorizedAccessDenied:
    """P4a: For any role NOT in the allowed set for a permission, is_authorized returns False."""

    @given(permission=valid_permissions)
    @settings(max_examples=200)
    def test_unauthorized_role_denied(self, permission: str):
        """Any role without a given permission must be denied access."""
        perm_enum = Permission(permission)
        denied_roles = _get_denied_roles_for_permission(perm_enum)

        # Skip if all roles have this permission (e.g. some basic perms)
        assume(len(denied_roles) > 0)

        for role in denied_roles:
            result = is_authorized(role, permission)
            assert result is False, (
                f"Role '{role}' should NOT be authorized for '{permission}' "
                f"but is_authorized returned True"
            )

    @given(role=valid_roles, permission=valid_permissions)
    @settings(max_examples=500)
    def test_random_role_permission_denial(self, role: str, permission: str):
        """For a random role/permission pair where the role lacks the permission, access is denied."""
        perm_enum = Permission(permission)
        allowed_roles = _get_allowed_roles_for_permission(perm_enum)

        # Only test when role is NOT in allowed set
        assume(role not in allowed_roles)

        result = is_authorized(role, permission)
        assert result is False, (
            f"Role '{role}' is NOT in the allowed set for '{permission}' "
            f"but is_authorized returned True"
        )


class TestP4bAuthorizedAccessGranted:
    """P4b: For any role IN the allowed set, is_authorized returns True."""

    @given(permission=valid_permissions)
    @settings(max_examples=200)
    def test_authorized_role_granted(self, permission: str):
        """Any role with a given permission must be granted access."""
        perm_enum = Permission(permission)
        allowed_roles = _get_allowed_roles_for_permission(perm_enum)

        # Every permission has at least SYSTEM_ADMIN
        assert len(allowed_roles) > 0

        for role in allowed_roles:
            result = is_authorized(role, permission)
            assert result is True, (
                f"Role '{role}' SHOULD be authorized for '{permission}' "
                f"but is_authorized returned False"
            )

    @given(role=valid_roles, permission=valid_permissions)
    @settings(max_examples=500)
    def test_random_role_permission_grant(self, role: str, permission: str):
        """For a random role/permission pair where the role has the permission, access is granted."""
        perm_enum = Permission(permission)
        allowed_roles = _get_allowed_roles_for_permission(perm_enum)

        # Only test when role IS in allowed set
        assume(role in allowed_roles)

        result = is_authorized(role, permission)
        assert result is True, (
            f"Role '{role}' IS in the allowed set for '{permission}' "
            f"but is_authorized returned False"
        )


class TestP4cSystemAdminFullAccess:
    """P4c: SYSTEM_ADMIN is authorized for all valid permissions."""

    @given(permission=valid_permissions)
    @settings(max_examples=100)
    def test_system_admin_has_all_permissions(self, permission: str):
        """SYSTEM_ADMIN must be authorized for every valid permission."""
        result = is_authorized(Role.SYSTEM_ADMIN.value, permission)
        assert result is True, (
            f"SYSTEM_ADMIN should be authorized for '{permission}' "
            f"but is_authorized returned False"
        )


class TestP4dInvalidRoleDenied:
    """P4d: Invalid role strings are never authorized for any permission."""

    @given(role=invalid_roles, permission=valid_permissions)
    @settings(max_examples=300)
    def test_invalid_role_always_denied(self, role: str, permission: str):
        """Any string that is not a valid role must be denied access to all permissions."""
        result = is_authorized(role, permission)
        assert result is False, (
            f"Invalid role '{role}' should NEVER be authorized for '{permission}' "
            f"but is_authorized returned True"
        )

    @given(role=invalid_roles)
    @settings(max_examples=100)
    def test_invalid_role_fails_validation(self, role: str):
        """Invalid role strings must fail role validation."""
        result = validate_role(role)
        assert result is False, (
            f"Invalid role '{role}' should NOT pass validation "
            f"but validate_role returned True"
        )


class TestP4eInvalidPermissionDenied:
    """P4e: Invalid permission strings are never authorized for any role."""

    @given(role=valid_roles, permission=invalid_permissions)
    @settings(max_examples=300)
    def test_invalid_permission_always_denied(self, role: str, permission: str):
        """Any string that is not a valid permission must be denied for all roles."""
        result = is_authorized(role, permission)
        assert result is False, (
            f"Role '{role}' should NEVER be authorized for invalid permission '{permission}' "
            f"but is_authorized returned True"
        )

    @given(permission=invalid_permissions)
    @settings(max_examples=100)
    def test_invalid_permission_denied_even_for_admin(self, permission: str):
        """Even SYSTEM_ADMIN cannot be authorized for invalid permissions."""
        result = is_authorized(Role.SYSTEM_ADMIN.value, permission)
        assert result is False, (
            f"SYSTEM_ADMIN should NOT be authorized for invalid permission '{permission}' "
            f"but is_authorized returned True"
        )
