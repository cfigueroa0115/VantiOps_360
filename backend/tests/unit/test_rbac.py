"""Unit tests for auth.rbac module.

Tests the RBAC system including role validation, permission matrix,
authorization checks, and single-role enforcement.

Requirements: 13.1, 13.2, 13.6
"""

from __future__ import annotations

import pytest

from auth.rbac import (
    Permission,
    PERMISSIONS,
    Role,
    get_allowed_permissions,
    is_authorized,
    validate_role,
    validate_single_role_assignment,
)


class TestRoleEnum:
    """Tests for the Role enum definition (REQ-13.1)."""

    def test_has_exactly_11_roles(self):
        """Lista Maestra defines exactly 11 roles."""
        assert len(Role) == 11

    def test_all_roles_present(self):
        """All 11 roles from the Lista Maestra are defined."""
        expected = {
            "SYSTEM_ADMIN",
            "OPERATIONS_LEAD",
            "ANALYST",
            "LEGAL_APPROVER",
            "VP_APPROVER",
            "BUSINESS_OWNER",
            "AUDITOR",
            "PARTNER_ADMIN",
            "PARTNER_OPERATOR",
            "CONTRACTOR_OPERATOR",
            "INTERN_READONLY",
        }
        actual = {r.value for r in Role}
        assert actual == expected

    def test_role_is_str_enum(self):
        """Roles should be usable as strings directly."""
        assert Role.SYSTEM_ADMIN == "SYSTEM_ADMIN"
        assert str(Role.ANALYST) == "ANALYST"


class TestPermissionEnum:
    """Tests for the Permission enum definition."""

    def test_has_all_permission_categories(self):
        """All permission codes from the spec are present."""
        expected_permissions = {
            "READ_DASHBOARD", "READ_CHARTS", "READ_KPIS", "READ_FILTERS",
            "READ_RCA", "READ_QUALITY", "READ_RISK", "READ_STATISTICS",
            "READ_REPORTS", "EXPORT_DATA",
            "READ_ANNULATIONS", "CREATE_ANNULATION", "APPROVE_ANNULATION",
            "READ_CAPACITY", "MANAGE_CAPACITY",
            "READ_AUDIT", "READ_EVIDENCE",
            "APPROVE_LEGAL", "APPROVE_VP",
            "MANAGE_USERS", "MANAGE_ROLES", "MANAGE_CONFIG",
            "INGEST_DATA",
            "MANAGE_OWN_PARTNER",
        }
        actual = {p.value for p in Permission}
        assert actual == expected_permissions

    def test_permission_count(self):
        """Verify total number of permissions defined."""
        assert len(Permission) == 24


class TestPermissionMatrix:
    """Tests for the PERMISSIONS constant mapping roles to permissions."""

    def test_all_roles_have_permissions(self):
        """Every role has an entry in the PERMISSIONS matrix."""
        for role in Role:
            assert role in PERMISSIONS, f"Role {role} missing from PERMISSIONS"

    def test_system_admin_has_all_permissions(self):
        """SYSTEM_ADMIN has access to every permission (full access)."""
        admin_perms = PERMISSIONS[Role.SYSTEM_ADMIN]
        for perm in Permission:
            assert perm in admin_perms, f"SYSTEM_ADMIN missing {perm}"

    def test_intern_readonly_has_no_admin_permissions(self):
        """INTERN_READONLY cannot manage users, roles, or config."""
        intern_perms = PERMISSIONS[Role.INTERN_READONLY]
        assert Permission.MANAGE_USERS not in intern_perms
        assert Permission.MANAGE_ROLES not in intern_perms
        assert Permission.MANAGE_CONFIG not in intern_perms

    def test_intern_readonly_has_basic_read(self):
        """INTERN_READONLY has basic read + RCA + quality + ingest."""
        intern_perms = PERMISSIONS[Role.INTERN_READONLY]
        assert Permission.READ_DASHBOARD in intern_perms
        assert Permission.READ_CHARTS in intern_perms
        assert Permission.READ_KPIS in intern_perms
        assert Permission.READ_FILTERS in intern_perms
        assert Permission.READ_RCA in intern_perms
        assert Permission.READ_QUALITY in intern_perms
        assert Permission.INGEST_DATA in intern_perms

    def test_operations_lead_has_capacity_management(self):
        """OPERATIONS_LEAD can manage capacity."""
        lead_perms = PERMISSIONS[Role.OPERATIONS_LEAD]
        assert Permission.READ_CAPACITY in lead_perms
        assert Permission.MANAGE_CAPACITY in lead_perms

    def test_legal_approver_has_legal_approval(self):
        """LEGAL_APPROVER can approve legal operations."""
        legal_perms = PERMISSIONS[Role.LEGAL_APPROVER]
        assert Permission.APPROVE_LEGAL in legal_perms
        assert Permission.APPROVE_ANNULATION in legal_perms

    def test_vp_approver_has_vp_approval(self):
        """VP_APPROVER can approve VP operations."""
        vp_perms = PERMISSIONS[Role.VP_APPROVER]
        assert Permission.APPROVE_VP in vp_perms
        assert Permission.APPROVE_ANNULATION in vp_perms

    def test_auditor_has_audit_access(self):
        """AUDITOR can read audit logs and evidence."""
        auditor_perms = PERMISSIONS[Role.AUDITOR]
        assert Permission.READ_AUDIT in auditor_perms
        assert Permission.READ_EVIDENCE in auditor_perms

    def test_partner_admin_has_own_partner_management(self):
        """PARTNER_ADMIN can manage their own organization."""
        partner_perms = PERMISSIONS[Role.PARTNER_ADMIN]
        assert Permission.MANAGE_OWN_PARTNER in partner_perms

    def test_business_owner_can_create_annulation(self):
        """BUSINESS_OWNER can create annulations."""
        owner_perms = PERMISSIONS[Role.BUSINESS_OWNER]
        assert Permission.CREATE_ANNULATION in owner_perms
        assert Permission.READ_ANNULATIONS in owner_perms

    def test_analyst_has_reports_and_export(self):
        """ANALYST can read reports and export data."""
        analyst_perms = PERMISSIONS[Role.ANALYST]
        assert Permission.READ_REPORTS in analyst_perms
        assert Permission.EXPORT_DATA in analyst_perms

    def test_contractor_cannot_approve(self):
        """CONTRACTOR_OPERATOR cannot approve anything."""
        contractor_perms = PERMISSIONS[Role.CONTRACTOR_OPERATOR]
        assert Permission.APPROVE_LEGAL not in contractor_perms
        assert Permission.APPROVE_VP not in contractor_perms
        assert Permission.APPROVE_ANNULATION not in contractor_perms

    def test_all_roles_have_basic_read(self):
        """Every role has at minimum the basic read permissions."""
        basic_read = {
            Permission.READ_DASHBOARD,
            Permission.READ_CHARTS,
            Permission.READ_KPIS,
            Permission.READ_FILTERS,
        }
        for role in Role:
            role_perms = PERMISSIONS[role]
            assert basic_read.issubset(role_perms), (
                f"Role {role} missing basic read permissions"
            )


class TestValidateRole:
    """Tests for validate_role() function."""

    def test_valid_roles(self):
        """All 11 roles pass validation."""
        for role in Role:
            assert validate_role(role.value) is True

    def test_invalid_role(self):
        """Unknown role strings return False."""
        assert validate_role("DEVELOPER") is False
        assert validate_role("SUPER_ADMIN") is False
        assert validate_role("admin") is False

    def test_empty_string(self):
        """Empty string is not a valid role."""
        assert validate_role("") is False

    def test_case_sensitive(self):
        """Role validation is case-sensitive."""
        assert validate_role("system_admin") is False
        assert validate_role("System_Admin") is False
        assert validate_role("SYSTEM_ADMIN") is True


class TestGetAllowedPermissions:
    """Tests for get_allowed_permissions() function."""

    def test_valid_role_returns_permissions(self):
        """Valid role returns a non-empty list of permission codes."""
        perms = get_allowed_permissions("ANALYST")
        assert len(perms) > 0
        assert "READ_DASHBOARD" in perms

    def test_system_admin_returns_all(self):
        """SYSTEM_ADMIN gets all permissions."""
        perms = get_allowed_permissions("SYSTEM_ADMIN")
        assert len(perms) == len(Permission)

    def test_invalid_role_returns_empty_list(self):
        """Invalid role returns empty list."""
        perms = get_allowed_permissions("INVALID")
        assert perms == []

    def test_returns_sorted_list(self):
        """Permissions are returned sorted alphabetically."""
        perms = get_allowed_permissions("ANALYST")
        assert perms == sorted(perms)

    def test_returns_strings(self):
        """Returned values are plain strings."""
        perms = get_allowed_permissions("AUDITOR")
        for p in perms:
            assert isinstance(p, str)


class TestIsAuthorized:
    """Tests for is_authorized() function (REQ-13.2, REQ-13.6)."""

    def test_admin_authorized_for_all(self):
        """SYSTEM_ADMIN is authorized for any valid permission."""
        for perm in Permission:
            assert is_authorized("SYSTEM_ADMIN", perm.value) is True

    def test_intern_denied_admin_actions(self):
        """INTERN_READONLY cannot perform admin actions."""
        assert is_authorized("INTERN_READONLY", "MANAGE_USERS") is False
        assert is_authorized("INTERN_READONLY", "MANAGE_ROLES") is False
        assert is_authorized("INTERN_READONLY", "MANAGE_CONFIG") is False

    def test_intern_allowed_read(self):
        """INTERN_READONLY can read dashboard."""
        assert is_authorized("INTERN_READONLY", "READ_DASHBOARD") is True

    def test_invalid_role_denied_everything(self):
        """Invalid role is denied all access (REQ-13.6)."""
        assert is_authorized("FAKE_ROLE", "READ_DASHBOARD") is False
        assert is_authorized("", "READ_DASHBOARD") is False

    def test_unknown_permission_denied(self):
        """Unknown permission code is always denied."""
        assert is_authorized("SYSTEM_ADMIN", "FLY_TO_MOON") is False

    def test_legal_approver_can_approve_legal(self):
        """LEGAL_APPROVER can use APPROVE_LEGAL."""
        assert is_authorized("LEGAL_APPROVER", "APPROVE_LEGAL") is True

    def test_legal_approver_cannot_approve_vp(self):
        """LEGAL_APPROVER cannot use APPROVE_VP."""
        assert is_authorized("LEGAL_APPROVER", "APPROVE_VP") is False

    def test_vp_approver_can_approve_vp(self):
        """VP_APPROVER can use APPROVE_VP."""
        assert is_authorized("VP_APPROVER", "APPROVE_VP") is True

    def test_vp_approver_cannot_approve_legal(self):
        """VP_APPROVER cannot use APPROVE_LEGAL."""
        assert is_authorized("VP_APPROVER", "APPROVE_LEGAL") is False

    def test_partner_operator_limited_access(self):
        """PARTNER_OPERATOR has read + annulations but no management."""
        assert is_authorized("PARTNER_OPERATOR", "READ_DASHBOARD") is True
        assert is_authorized("PARTNER_OPERATOR", "READ_ANNULATIONS") is True
        assert is_authorized("PARTNER_OPERATOR", "MANAGE_OWN_PARTNER") is False
        assert is_authorized("PARTNER_OPERATOR", "MANAGE_USERS") is False


class TestValidateSingleRoleAssignment:
    """Tests for validate_single_role_assignment() (REQ-13.2)."""

    def test_one_role_valid(self):
        """A user with exactly one role is valid."""
        assert validate_single_role_assignment(["ANALYST"]) is True

    def test_no_roles_valid(self):
        """A user with no roles is valid (but will be denied access per REQ-13.6)."""
        assert validate_single_role_assignment([]) is True

    def test_two_roles_invalid(self):
        """A user with two roles violates the single-role constraint."""
        assert validate_single_role_assignment(["ANALYST", "AUDITOR"]) is False

    def test_invalid_roles_ignored(self):
        """Invalid role strings are filtered out before counting."""
        # One valid + one invalid = 1 valid → passes
        assert validate_single_role_assignment(["ANALYST", "FAKE"]) is True

    def test_multiple_valid_roles_invalid(self):
        """Multiple valid roles are rejected."""
        assert validate_single_role_assignment(
            ["SYSTEM_ADMIN", "OPERATIONS_LEAD", "ANALYST"]
        ) is False
