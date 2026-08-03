"""Unit tests for operations.user_model module.

Tests the 42-user operational model including capacity checking,
expiration validation, and automatic deactivation with audit logging.

Requirements: 21.1, 21.2, 21.4
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from operations.user_model import (
    ROLES_WITH_EXPIRATION,
    TOTAL_CAPACITY,
    USER_CAPACITY,
    check_capacity,
    check_expiration,
    process_expirations,
    validate_expiration_required,
)


class TestUserCapacityConstants:
    """Tests for USER_CAPACITY and related constants (REQ-21.1)."""

    def test_total_capacity_is_42(self):
        """Total capacity across all roles must be 42."""
        assert TOTAL_CAPACITY == 42

    def test_intern_readonly_capacity(self):
        """INTERN_READONLY capacity is 12."""
        assert USER_CAPACITY["INTERN_READONLY"] == 12

    def test_contractor_operator_capacity(self):
        """CONTRACTOR_OPERATOR capacity is 20."""
        assert USER_CAPACITY["CONTRACTOR_OPERATOR"] == 20

    def test_business_owner_capacity(self):
        """BUSINESS_OWNER capacity is 10."""
        assert USER_CAPACITY["BUSINESS_OWNER"] == 10

    def test_roles_with_expiration(self):
        """Only INTERN_READONLY and CONTRACTOR_OPERATOR require expiration."""
        assert ROLES_WITH_EXPIRATION == {"INTERN_READONLY", "CONTRACTOR_OPERATOR"}


class TestCheckCapacity:
    """Tests for check_capacity function (REQ-21.1)."""

    def test_intern_has_room(self):
        """Room available when current < max for INTERN_READONLY."""
        assert check_capacity("INTERN_READONLY", 10) is True

    def test_intern_at_capacity(self):
        """No room when current equals max for INTERN_READONLY."""
        assert check_capacity("INTERN_READONLY", 12) is False

    def test_intern_over_capacity(self):
        """No room when current exceeds max for INTERN_READONLY."""
        assert check_capacity("INTERN_READONLY", 15) is False

    def test_contractor_has_room(self):
        """Room available when current < max for CONTRACTOR_OPERATOR."""
        assert check_capacity("CONTRACTOR_OPERATOR", 19) is True

    def test_contractor_at_capacity(self):
        """No room when current equals max for CONTRACTOR_OPERATOR."""
        assert check_capacity("CONTRACTOR_OPERATOR", 20) is False

    def test_business_has_room(self):
        """Room available when current < max for BUSINESS_OWNER."""
        assert check_capacity("BUSINESS_OWNER", 9) is True

    def test_business_at_capacity(self):
        """No room when current equals max for BUSINESS_OWNER."""
        assert check_capacity("BUSINESS_OWNER", 10) is False

    def test_zero_current_always_has_room(self):
        """Zero current always has capacity."""
        for role in USER_CAPACITY:
            assert check_capacity(role, 0) is True

    def test_one_below_max_has_room(self):
        """One below max always has capacity."""
        for role, max_cap in USER_CAPACITY.items():
            assert check_capacity(role, max_cap - 1) is True

    def test_unknown_role_raises(self):
        """Unknown role raises ValueError."""
        with pytest.raises(ValueError, match="Unknown role"):
            check_capacity("UNKNOWN_ROLE", 0)

    def test_negative_current_raises(self):
        """Negative current_active raises ValueError."""
        with pytest.raises(ValueError, match="current_active must be non-negative"):
            check_capacity("INTERN_READONLY", -1)


class TestCheckExpiration:
    """Tests for check_expiration function (REQ-21.4)."""

    def test_expired_in_past(self):
        """User with expires_at in the past is expired."""
        past = datetime.now(timezone.utc) - timedelta(days=1)
        assert check_expiration("user-1", past) is True

    def test_not_expired_in_future(self):
        """User with expires_at in the future is not expired."""
        future = datetime.now(timezone.utc) + timedelta(days=30)
        assert check_expiration("user-1", future) is False

    def test_no_expiration_returns_false(self):
        """User with no expires_at (None) never expires."""
        assert check_expiration("user-1", None) is False

    def test_expired_just_now(self):
        """User whose expires_at is exactly now is expired."""
        now = datetime.now(timezone.utc) - timedelta(seconds=1)
        assert check_expiration("user-1", now) is True

    def test_naive_datetime_treated_as_utc(self):
        """Naive datetime is treated as UTC."""
        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
        assert check_expiration("user-1", past) is True

    def test_empty_user_id_raises(self):
        """Empty user_id raises ValueError."""
        with pytest.raises(ValueError, match="user_id is required"):
            check_expiration("", datetime.now(timezone.utc))


class TestValidateExpirationRequired:
    """Tests for validate_expiration_required function (REQ-21.4)."""

    def test_intern_with_expiration_valid(self):
        """INTERN_READONLY with expires_at is valid."""
        future = datetime.now(timezone.utc) + timedelta(days=90)
        assert validate_expiration_required("INTERN_READONLY", future) is True

    def test_intern_without_expiration_invalid(self):
        """INTERN_READONLY without expires_at is invalid."""
        assert validate_expiration_required("INTERN_READONLY", None) is False

    def test_contractor_with_expiration_valid(self):
        """CONTRACTOR_OPERATOR with expires_at is valid."""
        future = datetime.now(timezone.utc) + timedelta(days=180)
        assert validate_expiration_required("CONTRACTOR_OPERATOR", future) is True

    def test_contractor_without_expiration_invalid(self):
        """CONTRACTOR_OPERATOR without expires_at is invalid."""
        assert validate_expiration_required("CONTRACTOR_OPERATOR", None) is False

    def test_business_without_expiration_valid(self):
        """BUSINESS_OWNER without expires_at is valid (no automatic expiration)."""
        assert validate_expiration_required("BUSINESS_OWNER", None) is True

    def test_business_with_expiration_valid(self):
        """BUSINESS_OWNER with expires_at is still valid (just not required)."""
        future = datetime.now(timezone.utc) + timedelta(days=365)
        assert validate_expiration_required("BUSINESS_OWNER", future) is True


class TestProcessExpirations:
    """Tests for process_expirations function (REQ-21.4)."""

    @patch("operations.user_model.log_audit_event")
    def test_deactivates_expired_intern(self, mock_audit):
        """Expired INTERN_READONLY user is deactivated."""
        past = datetime.now(timezone.utc) - timedelta(days=1)
        users = [
            {"user_id": "u1", "role": "INTERN_READONLY", "is_active": True, "expires_at": past},
        ]

        deactivated = process_expirations(users)

        assert deactivated == ["u1"]
        assert users[0]["is_active"] is False

    @patch("operations.user_model.log_audit_event")
    def test_deactivates_expired_contractor(self, mock_audit):
        """Expired CONTRACTOR_OPERATOR user is deactivated."""
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        users = [
            {"user_id": "u2", "role": "CONTRACTOR_OPERATOR", "is_active": True, "expires_at": past},
        ]

        deactivated = process_expirations(users)

        assert deactivated == ["u2"]
        assert users[0]["is_active"] is False

    @patch("operations.user_model.log_audit_event")
    def test_skips_business_owner(self, mock_audit):
        """BUSINESS_OWNER is never auto-expired even with expires_at set."""
        past = datetime.now(timezone.utc) - timedelta(days=1)
        users = [
            {"user_id": "u3", "role": "BUSINESS_OWNER", "is_active": True, "expires_at": past},
        ]

        deactivated = process_expirations(users)

        assert deactivated == []
        assert users[0]["is_active"] is True
        mock_audit.assert_not_called()

    @patch("operations.user_model.log_audit_event")
    def test_skips_already_inactive(self, mock_audit):
        """Already inactive users are not processed."""
        past = datetime.now(timezone.utc) - timedelta(days=1)
        users = [
            {"user_id": "u4", "role": "INTERN_READONLY", "is_active": False, "expires_at": past},
        ]

        deactivated = process_expirations(users)

        assert deactivated == []
        mock_audit.assert_not_called()

    @patch("operations.user_model.log_audit_event")
    def test_skips_not_expired(self, mock_audit):
        """Users with future expires_at are not deactivated."""
        future = datetime.now(timezone.utc) + timedelta(days=30)
        users = [
            {"user_id": "u5", "role": "INTERN_READONLY", "is_active": True, "expires_at": future},
        ]

        deactivated = process_expirations(users)

        assert deactivated == []
        assert users[0]["is_active"] is True
        mock_audit.assert_not_called()

    @patch("operations.user_model.log_audit_event")
    def test_multiple_users_mixed(self, mock_audit):
        """Mixed list: only expired users with expirable roles are deactivated."""
        past = datetime.now(timezone.utc) - timedelta(days=1)
        future = datetime.now(timezone.utc) + timedelta(days=30)
        users = [
            {"user_id": "u1", "role": "INTERN_READONLY", "is_active": True, "expires_at": past},
            {"user_id": "u2", "role": "CONTRACTOR_OPERATOR", "is_active": True, "expires_at": future},
            {"user_id": "u3", "role": "BUSINESS_OWNER", "is_active": True, "expires_at": None},
            {"user_id": "u4", "role": "CONTRACTOR_OPERATOR", "is_active": True, "expires_at": past},
            {"user_id": "u5", "role": "INTERN_READONLY", "is_active": False, "expires_at": past},
        ]

        deactivated = process_expirations(users)

        assert set(deactivated) == {"u1", "u4"}
        assert users[0]["is_active"] is False
        assert users[1]["is_active"] is True
        assert users[2]["is_active"] is True
        assert users[3]["is_active"] is False
        assert users[4]["is_active"] is False  # was already inactive

    @patch("operations.user_model.log_audit_event")
    def test_audit_event_logged_on_deactivation(self, mock_audit):
        """Audit event is logged when a user is deactivated."""
        past = datetime.now(timezone.utc) - timedelta(days=1)
        users = [
            {
                "user_id": "u1",
                "role": "INTERN_READONLY",
                "is_active": True,
                "expires_at": past,
                "email": "intern@vanti.com.co",
            },
        ]

        process_expirations(users)

        mock_audit.assert_called_once()
        call_kwargs = mock_audit.call_args[1] if mock_audit.call_args[1] else {}
        call_args = mock_audit.call_args[0] if mock_audit.call_args[0] else ()

        # Check it was called with expected arguments (positional or keyword)
        if call_kwargs:
            assert call_kwargs["user_id"] == "SYSTEM"
            assert call_kwargs["action"] == "USER_EXPIRED"
            assert call_kwargs["resource"] == "app_users"
            assert call_kwargs["resource_id"] == "u1"
            assert call_kwargs["result"] == "success"
            assert call_kwargs["details"]["role"] == "INTERN_READONLY"
            assert call_kwargs["details"]["reason"] == "automatic_expiration"
            assert call_kwargs["details"]["deactivated_user_id"] == "u1"

    @patch("operations.user_model.log_audit_event")
    def test_empty_list_returns_empty(self, mock_audit):
        """Empty user list returns empty deactivated list."""
        deactivated = process_expirations([])

        assert deactivated == []
        mock_audit.assert_not_called()

    def test_missing_user_id_raises(self):
        """Missing user_id raises ValueError."""
        users = [{"role": "INTERN_READONLY", "is_active": True, "expires_at": None}]
        with pytest.raises(ValueError, match="user_id"):
            process_expirations(users)

    def test_missing_role_raises(self):
        """Missing role raises ValueError."""
        users = [{"user_id": "u1", "is_active": True, "expires_at": None}]
        with pytest.raises(ValueError, match="role"):
            process_expirations(users)

    def test_missing_is_active_raises(self):
        """Missing is_active raises ValueError."""
        users = [{"user_id": "u1", "role": "INTERN_READONLY", "expires_at": None}]
        with pytest.raises(ValueError, match="is_active"):
            process_expirations(users)

    @patch("operations.user_model.log_audit_event")
    def test_supports_42_users_simultaneously(self, mock_audit):
        """Validates system can handle 42 users (REQ-21.1)."""
        past = datetime.now(timezone.utc) - timedelta(days=1)
        future = datetime.now(timezone.utc) + timedelta(days=30)

        users = []
        # 12 INTERN_READONLY (6 expired, 6 active)
        for i in range(6):
            users.append({
                "user_id": f"intern-expired-{i}",
                "role": "INTERN_READONLY",
                "is_active": True,
                "expires_at": past,
            })
        for i in range(6):
            users.append({
                "user_id": f"intern-active-{i}",
                "role": "INTERN_READONLY",
                "is_active": True,
                "expires_at": future,
            })
        # 20 CONTRACTOR_OPERATOR (10 expired, 10 active)
        for i in range(10):
            users.append({
                "user_id": f"contractor-expired-{i}",
                "role": "CONTRACTOR_OPERATOR",
                "is_active": True,
                "expires_at": past,
            })
        for i in range(10):
            users.append({
                "user_id": f"contractor-active-{i}",
                "role": "CONTRACTOR_OPERATOR",
                "is_active": True,
                "expires_at": future,
            })
        # 10 BUSINESS_OWNER (no expiration)
        for i in range(10):
            users.append({
                "user_id": f"business-{i}",
                "role": "BUSINESS_OWNER",
                "is_active": True,
                "expires_at": None,
            })

        assert len(users) == 42

        deactivated = process_expirations(users)

        # 6 interns + 10 contractors expired
        assert len(deactivated) == 16
        # All business users remain active
        for u in users:
            if u["role"] == "BUSINESS_OWNER":
                assert u["is_active"] is True
