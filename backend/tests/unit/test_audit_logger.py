"""
Unit tests for the audit logger module.

Tests:
  - AuditEvent creation and validation
  - log_audit_event with file fallback
  - query_audit_events with filtering and pagination
  - Synchronous write behavior
  - Error handling for invalid inputs

Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from audit.logger import (
    AuditEvent,
    log_audit_event,
    query_audit_events,
    AUDIT_LOG_FILE,
    _write_to_file,
    _query_from_file,
)


class TestAuditEvent:
    """Tests for AuditEvent dataclass creation and validation."""

    def test_create_valid_event(self):
        """A valid audit event is created with all required fields."""
        event = AuditEvent(
            user_id="user-123",
            action="LOGIN",
            resource="/api/auth",
        )
        assert event.user_id == "user-123"
        assert event.action == "LOGIN"
        assert event.resource == "/api/auth"
        assert event.result == "success"
        assert event.id is not None
        assert event.timestamp is not None

    def test_create_event_with_all_fields(self):
        """An event with all optional fields set is valid."""
        event = AuditEvent(
            user_id="admin-001",
            action="DELETE_USER",
            resource="/api/users",
            resource_id="user-456",
            result="success",
            ip_address="10.0.0.1",
            details={"reason": "account expired"},
            correlation_id="abc-123",
        )
        assert event.resource_id == "user-456"
        assert event.ip_address == "10.0.0.1"
        assert event.details == {"reason": "account expired"}
        assert event.correlation_id == "abc-123"

    def test_missing_user_id_raises_error(self):
        """An empty user_id raises ValueError."""
        with pytest.raises(ValueError, match="user_id is required"):
            AuditEvent(user_id="", action="LOGIN", resource="/api/auth")

    def test_missing_action_raises_error(self):
        """An empty action raises ValueError."""
        with pytest.raises(ValueError, match="action is required"):
            AuditEvent(user_id="user-1", action="", resource="/api/auth")

    def test_missing_resource_raises_error(self):
        """An empty resource raises ValueError."""
        with pytest.raises(ValueError, match="resource is required"):
            AuditEvent(user_id="user-1", action="LOGIN", resource="")

    def test_invalid_result_raises_error(self):
        """A result other than 'success' or 'failure' raises ValueError."""
        with pytest.raises(ValueError, match="result must be"):
            AuditEvent(
                user_id="user-1", action="LOGIN", resource="/api/auth", result="unknown"
            )

    def test_result_success(self):
        """Result 'success' is accepted."""
        event = AuditEvent(
            user_id="user-1", action="LOGIN", resource="/api/auth", result="success"
        )
        assert event.result == "success"

    def test_result_failure(self):
        """Result 'failure' is accepted."""
        event = AuditEvent(
            user_id="user-1", action="LOGIN", resource="/api/auth", result="failure"
        )
        assert event.result == "failure"

    def test_to_dict_excludes_none(self):
        """to_dict() omits keys with None values."""
        event = AuditEvent(
            user_id="user-1", action="READ", resource="/dashboard"
        )
        d = event.to_dict()
        assert "resource_id" not in d
        assert "ip_address" not in d
        assert "details" not in d
        assert "correlation_id" not in d
        # Required fields always present
        assert "user_id" in d
        assert "action" in d
        assert "resource" in d
        assert "id" in d
        assert "timestamp" in d


class TestLogAuditEvent:
    """Tests for the log_audit_event function with file-based fallback."""

    @pytest.fixture(autouse=True)
    def _use_temp_dir(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """Use a temporary directory for the audit log file."""
        temp_log_dir = tmp_path / "audit"
        temp_log_file = temp_log_dir / "audit_log.jsonl"
        monkeypatch.setattr(
            "audit.logger.AUDIT_LOG_DIR", temp_log_dir
        )
        monkeypatch.setattr(
            "audit.logger.AUDIT_LOG_FILE", temp_log_file
        )
        self.log_dir = temp_log_dir
        self.log_file = temp_log_file

    def test_log_event_writes_to_file_when_no_db(self):
        """When DATABASE_URL is not set, event is written to file fallback."""
        with patch.dict(os.environ, {}, clear=True):
            event = log_audit_event(
                user_id="user-123",
                action="LOGIN",
                resource="/api/auth",
                result="success",
                ip_address="192.168.1.1",
            )

        assert self.log_file.exists()
        content = self.log_file.read_text()
        data = json.loads(content.strip())
        assert data["user_id"] == "user-123"
        assert data["action"] == "LOGIN"
        assert data["resource"] == "/api/auth"
        assert data["result"] == "success"
        assert data["ip_address"] == "192.168.1.1"

    def test_log_event_returns_audit_event_instance(self):
        """log_audit_event returns an AuditEvent dataclass instance."""
        with patch.dict(os.environ, {}, clear=True):
            event = log_audit_event(
                user_id="admin",
                action="CREATE",
                resource="/api/users",
            )

        assert isinstance(event, AuditEvent)
        assert event.user_id == "admin"
        assert event.action == "CREATE"
        assert event.resource == "/api/users"

    def test_log_event_with_details(self):
        """Details dict is persisted as JSON."""
        with patch.dict(os.environ, {}, clear=True):
            event = log_audit_event(
                user_id="user-1",
                action="UPDATE",
                resource="/api/config",
                details={"key": "timeout", "old_value": 30, "new_value": 60},
            )

        content = self.log_file.read_text()
        data = json.loads(content.strip())
        assert data["details"]["key"] == "timeout"
        assert data["details"]["new_value"] == 60

    def test_log_multiple_events_are_appended(self):
        """Multiple events are appended to the file (append-only, REQ-14.2)."""
        with patch.dict(os.environ, {}, clear=True):
            log_audit_event(user_id="u1", action="A1", resource="/r1")
            log_audit_event(user_id="u2", action="A2", resource="/r2")
            log_audit_event(user_id="u3", action="A3", resource="/r3")

        lines = self.log_file.read_text().strip().split("\n")
        assert len(lines) == 3
        assert json.loads(lines[0])["user_id"] == "u1"
        assert json.loads(lines[1])["user_id"] == "u2"
        assert json.loads(lines[2])["user_id"] == "u3"

    def test_log_event_validation_error(self):
        """Invalid parameters raise ValueError before any write."""
        with pytest.raises(ValueError):
            log_audit_event(user_id="", action="LOGIN", resource="/api/auth")

    def test_log_event_correlation_id(self):
        """Correlation ID is persisted when provided."""
        with patch.dict(os.environ, {}, clear=True):
            event = log_audit_event(
                user_id="user-1",
                action="PROCESS",
                resource="/api/etl",
                correlation_id="corr-uuid-123",
            )

        content = self.log_file.read_text()
        data = json.loads(content.strip())
        assert data["correlation_id"] == "corr-uuid-123"


class TestQueryAuditEvents:
    """Tests for query_audit_events with file fallback filtering and pagination."""

    @pytest.fixture(autouse=True)
    def _setup_log_file(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """Create a temp log file with sample data."""
        temp_log_dir = tmp_path / "audit"
        temp_log_dir.mkdir()
        temp_log_file = temp_log_dir / "audit_log.jsonl"
        monkeypatch.setattr(
            "audit.logger.AUDIT_LOG_DIR", temp_log_dir
        )
        monkeypatch.setattr(
            "audit.logger.AUDIT_LOG_FILE", temp_log_file
        )
        self.log_file = temp_log_file

        # Seed sample events
        events = [
            {"id": "e1", "timestamp": "2024-01-10T10:00:00+00:00", "user_id": "user-a", "action": "LOGIN", "resource": "/api/auth", "result": "success"},
            {"id": "e2", "timestamp": "2024-01-11T12:00:00+00:00", "user_id": "user-b", "action": "CREATE", "resource": "/api/annulations", "result": "success"},
            {"id": "e3", "timestamp": "2024-01-12T14:00:00+00:00", "user_id": "user-a", "action": "ACCESS_DENIED", "resource": "/api/admin", "result": "failure"},
            {"id": "e4", "timestamp": "2024-01-13T08:00:00+00:00", "user_id": "user-c", "action": "LOGIN", "resource": "/api/auth", "result": "success"},
            {"id": "e5", "timestamp": "2024-01-14T16:00:00+00:00", "user_id": "user-a", "action": "UPDATE", "resource": "/api/config", "result": "success"},
        ]
        with open(temp_log_file, "w", encoding="utf-8") as f:
            for e in events:
                f.write(json.dumps(e) + "\n")

    def test_query_all_no_filter(self):
        """Query without filters returns all events."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events()

        assert result["total"] == 5
        assert result["page"] == 1
        assert result["pageSize"] == 50
        assert len(result["data"]) == 5

    def test_query_filter_by_user_id(self):
        """Filter by user_id returns only matching events."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events(user_id="user-a")

        assert result["total"] == 3
        for event in result["data"]:
            assert event["userId"] == "user-a"

    def test_query_filter_by_action(self):
        """Filter by action returns only matching events."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events(action="LOGIN")

        assert result["total"] == 2
        for event in result["data"]:
            assert event["action"] == "LOGIN"

    def test_query_filter_by_resource(self):
        """Filter by resource returns only matching events."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events(resource="/api/auth")

        assert result["total"] == 2
        for event in result["data"]:
            assert event["resource"] == "/api/auth"

    def test_query_filter_by_date_range(self):
        """Filter by date range returns events within the range."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events(
                date_start="2024-01-11T00:00:00+00:00",
                date_end="2024-01-13T23:59:59+00:00",
            )

        assert result["total"] == 3
        # Events e2, e3, e4 are within range
        ids = [e["id"] for e in result["data"]]
        assert "e2" in ids
        assert "e3" in ids
        assert "e4" in ids

    def test_query_pagination(self):
        """Pagination returns the correct subset."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events(page=1, page_size=2)

        assert result["total"] == 5
        assert result["page"] == 1
        assert result["pageSize"] == 2
        assert len(result["data"]) == 2

    def test_query_pagination_page_2(self):
        """Second page returns next set of results."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events(page=2, page_size=2)

        assert result["total"] == 5
        assert result["page"] == 2
        assert len(result["data"]) == 2

    def test_query_results_sorted_by_timestamp_desc(self):
        """Results are sorted by timestamp in descending order."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events()

        timestamps = [e["timestamp"] for e in result["data"]]
        assert timestamps == sorted(timestamps, reverse=True)

    def test_query_combined_filters(self):
        """Multiple filters are combined with AND logic."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events(user_id="user-a", action="LOGIN")

        assert result["total"] == 1
        assert result["data"][0]["userId"] == "user-a"
        assert result["data"][0]["action"] == "LOGIN"

    def test_query_empty_result(self):
        """Query with no matching results returns empty data."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events(user_id="nonexistent-user")

        assert result["total"] == 0
        assert result["data"] == []

    def test_query_response_uses_camelcase_keys(self):
        """Response data uses camelCase keys per API contract."""
        with patch.dict(os.environ, {}, clear=True):
            result = query_audit_events(page_size=1)

        event = result["data"][0]
        assert "userId" in event
        assert "ipAddress" in event
        assert "resourceId" in event
        assert "correlationId" in event
        # Should NOT have snake_case keys
        assert "user_id" not in event
        assert "ip_address" not in event
