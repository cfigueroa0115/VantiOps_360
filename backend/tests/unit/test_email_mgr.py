"""
Unit tests for the email management module.

Tests:
  - EmailDirectory creation and persistence
  - Bulk activate/deactivate with SYSTEM_ADMIN requirement
  - Throttled sending (max 100 emails/minute)
  - Audit logging of all communications
  - Directory size limit (2,000 entries)

Requirements: 22.1, 22.2, 22.3, 22.4
"""

import json
import os
import time
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from communications.email_mgr import (
    EmailDirectory,
    EmailEntry,
    EmailStatus,
    ThrottledSender,
    MAX_DIRECTORY_SIZE,
    MAX_EMAILS_PER_MINUTE,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def temp_storage(tmp_path: Path) -> Path:
    """Provide a temporary path for the email directory JSON file."""
    return tmp_path / "email_directory.json"


@pytest.fixture
def temp_audit_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect audit log writes to a temp directory."""
    audit_dir = tmp_path / "audit"
    audit_file = audit_dir / "audit_log.jsonl"
    monkeypatch.setattr("audit.logger.AUDIT_LOG_DIR", audit_dir)
    monkeypatch.setattr("audit.logger.AUDIT_LOG_FILE", audit_file)
    return audit_file


@pytest.fixture
def directory(temp_storage: Path, temp_audit_dir: Path) -> EmailDirectory:
    """Create a fresh EmailDirectory with temp storage and audit log."""
    return EmailDirectory(storage_path=temp_storage)


@pytest.fixture
def populated_directory(temp_storage: Path, temp_audit_dir: Path) -> EmailDirectory:
    """Create an EmailDirectory pre-populated with 5 entries."""
    # Seed the JSON file
    emails = [
        {"email": f"user{i}@vanti.com.co", "status": "activo", "updated_at": "2024-01-01T00:00:00+00:00"}
        for i in range(5)
    ]
    data = {"emails": emails, "total": 5, "updated_at": "2024-01-01T00:00:00+00:00"}
    temp_storage.parent.mkdir(parents=True, exist_ok=True)
    temp_storage.write_text(json.dumps(data), encoding="utf-8")
    return EmailDirectory(storage_path=temp_storage)


# ---------------------------------------------------------------------------
# EmailEntry Tests
# ---------------------------------------------------------------------------


class TestEmailEntry:
    """Tests for the EmailEntry dataclass."""

    def test_create_default_entry(self):
        """Default entry has 'activo' status and a timestamp."""
        entry = EmailEntry(email="test@vanti.com.co")
        assert entry.email == "test@vanti.com.co"
        assert entry.status == EmailStatus.ACTIVO
        assert entry.updated_at is not None

    def test_to_dict(self):
        """to_dict produces JSON-serializable output."""
        entry = EmailEntry(
            email="test@vanti.com.co",
            status=EmailStatus.INACTIVO,
            updated_at="2024-06-01T12:00:00+00:00",
        )
        d = entry.to_dict()
        assert d["email"] == "test@vanti.com.co"
        assert d["status"] == "inactivo"
        assert d["updated_at"] == "2024-06-01T12:00:00+00:00"

    def test_from_dict(self):
        """from_dict reconstructs an EmailEntry from a dictionary."""
        data = {
            "email": "admin@vanti.com.co",
            "status": "suspendido",
            "updated_at": "2024-03-15T08:30:00+00:00",
        }
        entry = EmailEntry.from_dict(data)
        assert entry.email == "admin@vanti.com.co"
        assert entry.status == EmailStatus.SUSPENDIDO
        assert entry.updated_at == "2024-03-15T08:30:00+00:00"


# ---------------------------------------------------------------------------
# ThrottledSender Tests
# ---------------------------------------------------------------------------


class TestThrottledSender:
    """Tests for the ThrottledSender rate limiter."""

    def test_can_send_initially(self):
        """A fresh throttler allows sending."""
        ts = ThrottledSender(max_per_minute=100)
        assert ts.can_send() is True

    def test_record_send_success(self):
        """record_send returns True when under limit."""
        ts = ThrottledSender(max_per_minute=100)
        assert ts.record_send() is True
        assert ts.get_current_count() == 1

    def test_rate_limit_enforced(self):
        """After max sends, further sends are throttled."""
        ts = ThrottledSender(max_per_minute=5)
        for _ in range(5):
            assert ts.record_send() is True
        # 6th send should be throttled
        assert ts.record_send() is False
        assert ts.can_send() is False

    def test_max_per_minute_property(self):
        """max_per_minute exposes the configured limit."""
        ts = ThrottledSender(max_per_minute=42)
        assert ts.max_per_minute == 42

    def test_wait_time_zero_when_under_limit(self):
        """wait_time_seconds is 0 when sends are allowed."""
        ts = ThrottledSender(max_per_minute=100)
        assert ts.wait_time_seconds() == 0.0

    def test_wait_time_positive_when_at_limit(self):
        """wait_time_seconds is positive when rate limit is reached."""
        ts = ThrottledSender(max_per_minute=2)
        ts.record_send()
        ts.record_send()
        wait = ts.wait_time_seconds()
        assert wait > 0.0
        assert wait <= 60.0

    def test_window_expiration(self):
        """Old timestamps outside the 60s window are pruned."""
        ts = ThrottledSender(max_per_minute=2)
        # Manually inject old timestamps
        ts._send_timestamps = [time.time() - 61.0, time.time() - 62.0]
        # Should be able to send since old ones are expired
        assert ts.can_send() is True
        assert ts.get_current_count() == 0


# ---------------------------------------------------------------------------
# EmailDirectory Tests — Basic Operations (REQ-22.1)
# ---------------------------------------------------------------------------


class TestEmailDirectoryBasic:
    """Tests for EmailDirectory basic CRUD operations."""

    def test_empty_directory_on_init(self, directory: EmailDirectory):
        """A new directory starts empty when no file exists."""
        assert directory.size == 0

    def test_add_email(self, directory: EmailDirectory):
        """Adding an email increases the directory size."""
        result = directory.add_email("new@vanti.com.co", "SYSTEM_ADMIN")
        assert result is True
        assert directory.size == 1

    def test_add_duplicate_email_rejected(self, directory: EmailDirectory):
        """Adding a duplicate email returns False."""
        directory.add_email("dup@vanti.com.co", "SYSTEM_ADMIN")
        result = directory.add_email("DUP@vanti.com.co", "SYSTEM_ADMIN")
        assert result is False
        assert directory.size == 1

    def test_email_normalized_lowercase(self, directory: EmailDirectory):
        """Emails are stored normalized to lowercase."""
        directory.add_email("MiXeD@Vanti.Com.Co", "SYSTEM_ADMIN")
        entry = directory.get_entry("mixed@vanti.com.co")
        assert entry is not None
        assert entry.email == "mixed@vanti.com.co"

    def test_get_entry_not_found(self, directory: EmailDirectory):
        """get_entry returns None for nonexistent emails."""
        assert directory.get_entry("noone@test.com") is None

    def test_remove_email(self, directory: EmailDirectory):
        """Removing an email decreases directory size."""
        directory.add_email("remove@vanti.com.co", "SYSTEM_ADMIN")
        assert directory.size == 1
        result = directory.remove_email("remove@vanti.com.co", "SYSTEM_ADMIN")
        assert result is True
        assert directory.size == 0

    def test_remove_nonexistent_email(self, directory: EmailDirectory):
        """Removing a nonexistent email returns False."""
        result = directory.remove_email("ghost@test.com", "SYSTEM_ADMIN")
        assert result is False

    def test_list_entries_empty(self, directory: EmailDirectory):
        """List entries on empty directory returns empty data."""
        result = directory.list_entries()
        assert result["total"] == 0
        assert result["data"] == []

    def test_list_entries_with_filter(self, populated_directory: EmailDirectory):
        """List entries can filter by status."""
        result = populated_directory.list_entries(status=EmailStatus.ACTIVO)
        assert result["total"] == 5

        result = populated_directory.list_entries(status=EmailStatus.INACTIVO)
        assert result["total"] == 0

    def test_list_entries_pagination(self, populated_directory: EmailDirectory):
        """Pagination returns correct subset."""
        result = populated_directory.list_entries(page=1, page_size=2)
        assert result["total"] == 5
        assert len(result["data"]) == 2
        assert result["page"] == 1
        assert result["pageSize"] == 2

    def test_persistence_roundtrip(self, temp_storage: Path, temp_audit_dir: Path):
        """Data persists across directory instances."""
        dir1 = EmailDirectory(storage_path=temp_storage)
        dir1.add_email("persist@vanti.com.co", "SYSTEM_ADMIN")
        assert dir1.size == 1

        # Create new instance from same file
        dir2 = EmailDirectory(storage_path=temp_storage)
        assert dir2.size == 1
        entry = dir2.get_entry("persist@vanti.com.co")
        assert entry is not None
        assert entry.status == EmailStatus.ACTIVO

    def test_directory_max_size_enforced(self, temp_storage: Path, temp_audit_dir: Path):
        """Directory rejects additions beyond MAX_DIRECTORY_SIZE (REQ-22.1)."""
        # Pre-seed a nearly-full directory
        emails = [
            {"email": f"u{i}@test.com", "status": "activo", "updated_at": "2024-01-01T00:00:00+00:00"}
            for i in range(MAX_DIRECTORY_SIZE)
        ]
        data = {"emails": emails, "total": MAX_DIRECTORY_SIZE, "updated_at": "2024-01-01T00:00:00+00:00"}
        temp_storage.parent.mkdir(parents=True, exist_ok=True)
        temp_storage.write_text(json.dumps(data), encoding="utf-8")

        directory = EmailDirectory(storage_path=temp_storage)
        assert directory.size == MAX_DIRECTORY_SIZE

        # Attempt to add one more
        result = directory.add_email("overflow@vanti.com.co", "SYSTEM_ADMIN")
        assert result is False
        assert directory.size == MAX_DIRECTORY_SIZE


# ---------------------------------------------------------------------------
# Bulk Operations Tests (REQ-22.2)
# ---------------------------------------------------------------------------


class TestBulkOperations:
    """Tests for bulk activate/deactivate requiring SYSTEM_ADMIN."""

    def test_activate_emails_requires_system_admin(self, populated_directory: EmailDirectory):
        """Non-SYSTEM_ADMIN role is denied bulk activate."""
        with pytest.raises(PermissionError, match="not authorized"):
            populated_directory.activate_emails(
                ["user0@vanti.com.co"], admin_id="ANALYST"
            )

    def test_deactivate_emails_requires_system_admin(self, populated_directory: EmailDirectory):
        """Non-SYSTEM_ADMIN role is denied bulk deactivate."""
        with pytest.raises(PermissionError, match="not authorized"):
            populated_directory.deactivate_emails(
                ["user0@vanti.com.co"], admin_id="INTERN_READONLY"
            )

    def test_activate_emails_success(self, populated_directory: EmailDirectory):
        """SYSTEM_ADMIN can bulk activate inactivo emails."""
        # First deactivate some
        populated_directory.deactivate_emails(
            ["user0@vanti.com.co", "user1@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )
        entry0 = populated_directory.get_entry("user0@vanti.com.co")
        assert entry0 is not None
        assert entry0.status == EmailStatus.INACTIVO

        # Now reactivate
        count = populated_directory.activate_emails(
            ["user0@vanti.com.co", "user1@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )
        assert count == 2
        entry0 = populated_directory.get_entry("user0@vanti.com.co")
        assert entry0 is not None
        assert entry0.status == EmailStatus.ACTIVO

    def test_deactivate_emails_success(self, populated_directory: EmailDirectory):
        """SYSTEM_ADMIN can bulk deactivate activo emails."""
        count = populated_directory.deactivate_emails(
            ["user0@vanti.com.co", "user2@vanti.com.co", "user4@vanti.com.co"],
            admin_id="SYSTEM_ADMIN",
        )
        assert count == 3
        for email in ["user0@vanti.com.co", "user2@vanti.com.co", "user4@vanti.com.co"]:
            entry = populated_directory.get_entry(email)
            assert entry is not None
            assert entry.status == EmailStatus.INACTIVO

    def test_activate_already_active_returns_zero(self, populated_directory: EmailDirectory):
        """Activating already-active emails does not count them."""
        count = populated_directory.activate_emails(
            ["user0@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )
        assert count == 0

    def test_deactivate_already_inactive_returns_zero(self, populated_directory: EmailDirectory):
        """Deactivating already-inactive emails does not count them."""
        populated_directory.deactivate_emails(
            ["user0@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )
        count = populated_directory.deactivate_emails(
            ["user0@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )
        assert count == 0

    def test_bulk_with_nonexistent_emails(self, populated_directory: EmailDirectory):
        """Nonexistent emails in the list are silently skipped."""
        count = populated_directory.activate_emails(
            ["nonexistent@test.com", "user0@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )
        # user0 is already active, nonexistent is not in directory
        assert count == 0


# ---------------------------------------------------------------------------
# Throttled Sending Tests (REQ-22.3)
# ---------------------------------------------------------------------------


class TestSendEmail:
    """Tests for send_email with throttle enforcement."""

    def test_send_to_active_recipient(self, populated_directory: EmailDirectory):
        """Sending to an active recipient succeeds."""
        result = populated_directory.send_email(
            to="user0@vanti.com.co",
            subject="Test Subject",
            body="Test body content",
            sender_id="SYSTEM_ADMIN",
        )
        assert result is True

    def test_send_to_inactive_recipient_fails(self, populated_directory: EmailDirectory):
        """Sending to an inactive recipient is rejected."""
        populated_directory.deactivate_emails(
            ["user0@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )
        result = populated_directory.send_email(
            to="user0@vanti.com.co",
            subject="Test",
            body="Body",
            sender_id="SYSTEM_ADMIN",
        )
        assert result is False

    def test_send_to_nonexistent_recipient_fails(self, populated_directory: EmailDirectory):
        """Sending to a non-directory email is rejected."""
        result = populated_directory.send_email(
            to="unknown@external.com",
            subject="Test",
            body="Body",
            sender_id="SYSTEM_ADMIN",
        )
        assert result is False

    def test_throttle_enforced(self, temp_storage: Path, temp_audit_dir: Path):
        """Sending more than max_per_minute is throttled (REQ-22.3)."""
        # Create directory with a low throttle for testing
        directory = EmailDirectory(storage_path=temp_storage)
        # Override throttler with a low limit
        directory._throttler = ThrottledSender(max_per_minute=3)

        # Add a recipient
        directory.add_email("recipient@vanti.com.co", "SYSTEM_ADMIN")

        # Send up to limit
        for i in range(3):
            result = directory.send_email(
                to="recipient@vanti.com.co",
                subject=f"Email {i}",
                body="Content",
                sender_id="SYSTEM_ADMIN",
            )
            assert result is True

        # 4th send should be throttled
        result = directory.send_email(
            to="recipient@vanti.com.co",
            subject="Throttled email",
            body="Content",
            sender_id="SYSTEM_ADMIN",
        )
        assert result is False


# ---------------------------------------------------------------------------
# Audit Logging Tests (REQ-22.4)
# ---------------------------------------------------------------------------


class TestAuditLogging:
    """Tests verifying all operations produce audit events."""

    def test_send_email_produces_audit_event(self, populated_directory: EmailDirectory, temp_audit_dir: Path):
        """send_email logs a communication to audit_events."""
        populated_directory.send_email(
            to="user0@vanti.com.co",
            subject="Audit Test",
            body="Body",
            sender_id="SYSTEM_ADMIN",
        )

        assert temp_audit_dir.exists()
        content = temp_audit_dir.read_text()
        events = [json.loads(line) for line in content.strip().split("\n") if line.strip()]

        # Find the EMAIL_SENT event
        sent_events = [e for e in events if e["action"] == "EMAIL_SENT"]
        assert len(sent_events) >= 1
        event = sent_events[-1]
        assert event["details"]["recipient"] == "user0@vanti.com.co"
        assert event["details"]["subject"] == "Audit Test"
        assert event["details"]["delivery_status"] == "sent"

    def test_bulk_activate_produces_audit_event(self, populated_directory: EmailDirectory, temp_audit_dir: Path):
        """Bulk activate logs to audit."""
        populated_directory.deactivate_emails(
            ["user0@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )
        populated_directory.activate_emails(
            ["user0@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )

        content = temp_audit_dir.read_text()
        events = [json.loads(line) for line in content.strip().split("\n") if line.strip()]
        activate_events = [e for e in events if e["action"] == "BULK_ACTIVATE"]
        assert len(activate_events) >= 1
        assert activate_events[-1]["details"]["activated"] == 1

    def test_bulk_deactivate_produces_audit_event(self, populated_directory: EmailDirectory, temp_audit_dir: Path):
        """Bulk deactivate logs to audit."""
        populated_directory.deactivate_emails(
            ["user0@vanti.com.co", "user1@vanti.com.co"], admin_id="SYSTEM_ADMIN"
        )

        content = temp_audit_dir.read_text()
        events = [json.loads(line) for line in content.strip().split("\n") if line.strip()]
        deactivate_events = [e for e in events if e["action"] == "BULK_DEACTIVATE"]
        assert len(deactivate_events) >= 1
        assert deactivate_events[-1]["details"]["deactivated"] == 2

    def test_throttled_send_produces_audit_event(self, temp_storage: Path, temp_audit_dir: Path):
        """A throttled send logs a failure event (REQ-22.4)."""
        directory = EmailDirectory(storage_path=temp_storage)
        directory._throttler = ThrottledSender(max_per_minute=1)
        directory.add_email("target@vanti.com.co", "SYSTEM_ADMIN")

        # First send succeeds
        directory.send_email(
            to="target@vanti.com.co", subject="OK", body="B", sender_id="SYSTEM_ADMIN"
        )
        # Second send is throttled
        directory.send_email(
            to="target@vanti.com.co", subject="Throttled", body="B", sender_id="SYSTEM_ADMIN"
        )

        content = temp_audit_dir.read_text()
        events = [json.loads(line) for line in content.strip().split("\n") if line.strip()]
        throttled_events = [e for e in events if e["action"] == "EMAIL_SEND_THROTTLED"]
        assert len(throttled_events) >= 1
        assert throttled_events[-1]["details"]["reason"] == "rate_limit_exceeded"

    def test_denied_bulk_operation_produces_audit_event(self, populated_directory: EmailDirectory, temp_audit_dir: Path):
        """A denied bulk operation logs to audit (REQ-22.4)."""
        with pytest.raises(PermissionError):
            populated_directory.activate_emails(
                ["user0@vanti.com.co"], admin_id="ANALYST"
            )

        content = temp_audit_dir.read_text()
        events = [json.loads(line) for line in content.strip().split("\n") if line.strip()]
        denied_events = [e for e in events if e["action"] == "BULK_ACTIVATE_DENIED"]
        assert len(denied_events) >= 1
        assert denied_events[-1]["result"] == "failure"


# ---------------------------------------------------------------------------
# Permission Tests (REQ-22.2)
# ---------------------------------------------------------------------------


class TestPermissions:
    """Tests verifying SYSTEM_ADMIN role is required for management operations."""

    def test_add_email_requires_admin(self, directory: EmailDirectory):
        """Non-admin cannot add emails to directory."""
        with pytest.raises(PermissionError):
            directory.add_email("new@vanti.com.co", "ANALYST")

    def test_remove_email_requires_admin(self, directory: EmailDirectory):
        """Non-admin cannot remove emails from directory."""
        with pytest.raises(PermissionError):
            directory.remove_email("any@test.com", "CONTRACTOR_OPERATOR")

    def test_various_roles_denied_bulk_activate(self, populated_directory: EmailDirectory):
        """Multiple non-admin roles are denied bulk activate."""
        for role in ["ANALYST", "AUDITOR", "INTERN_READONLY", "CONTRACTOR_OPERATOR", "BUSINESS_OWNER"]:
            with pytest.raises(PermissionError):
                populated_directory.activate_emails(
                    ["user0@vanti.com.co"], admin_id=role
                )

    def test_various_roles_denied_bulk_deactivate(self, populated_directory: EmailDirectory):
        """Multiple non-admin roles are denied bulk deactivate."""
        for role in ["ANALYST", "AUDITOR", "INTERN_READONLY", "PARTNER_OPERATOR"]:
            with pytest.raises(PermissionError):
                populated_directory.deactivate_emails(
                    ["user0@vanti.com.co"], admin_id=role
                )
