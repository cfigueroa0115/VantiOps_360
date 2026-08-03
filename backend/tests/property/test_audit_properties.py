"""
Property-based tests for audit log immutability (Property 11).

**Validates: Requirements 14.2, 14.4**

Uses Hypothesis to verify:
- P11a: For any sequence of log_audit_event() calls, the total number of events
        only increases (never decreases) — monotonic growth.
- P11b: For any logged event, its data is unchanged when queried later
        (no modification possible at application level).
- P11c: The file-based fallback is append-only (existing lines never change).
- P11d: Once an event is logged, it cannot be removed from the log.

Since we cannot run actual PostgreSQL with DB-level rules in CI, these tests
exercise the application-level immutability guarantees of the audit logger
using the file-based fallback mechanism.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import hypothesis.strategies as st
from hypothesis import HealthCheck, given, settings

from audit.logger import (
    log_audit_event,
    query_audit_events,
)

# --- Strategies ---

# User IDs: non-empty alphanumeric strings
user_ids = st.from_regex(r"user-[a-z0-9]{3,10}", fullmatch=True)

# Actions: common audit action verbs
actions = st.sampled_from([
    "LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE",
    "ACCESS_DENIED", "APPROVE", "REJECT", "EXPORT", "IMPORT",
    "CREATE_ANNULATION", "TRANSITION_STATE", "VIEW_REPORT",
])

# Resources: plausible resource paths
resources = st.sampled_from([
    "/api/annulations",
    "/api/auth",
    "/api/users",
    "/api/reports",
    "/api/capacity",
    "/api/migration",
    "cancellation_request",
    "user_profile",
    "audit_log",
    "approval_workflow",
])

# Results: success or failure
results = st.sampled_from(["success", "failure"])

# IP addresses
ip_addresses = st.from_regex(
    r"192\.168\.[0-9]{1,3}\.[0-9]{1,3}", fullmatch=True
)

# Details: optional metadata dict
details = st.one_of(
    st.none(),
    st.fixed_dictionaries({
        "reason": st.text(min_size=1, max_size=30, alphabet=st.characters(whitelist_categories=("L", "N", "Z"))),
    }),
)


# --- Helper: Patch audit logger to use temp file ---


class TempAuditFileContext:
    """Context manager that patches audit logger to use a temporary file."""

    def __init__(self):
        self.temp_dir = None
        self.temp_file = None
        self._patches = []

    def __enter__(self):
        self.temp_dir = tempfile.mkdtemp()
        self.temp_file = Path(self.temp_dir) / "audit_log.jsonl"
        temp_dir_path = Path(self.temp_dir)

        # Patch both the file path and directory, and disable DB writes
        p1 = patch("audit.logger.AUDIT_LOG_FILE", self.temp_file)
        p2 = patch("audit.logger.AUDIT_LOG_DIR", temp_dir_path)
        p3 = patch("audit.logger._get_database_url", return_value=None)

        self._patches = [p1, p2, p3]
        for p in self._patches:
            p.start()

        return self

    def __exit__(self, *args):
        for p in self._patches:
            p.stop()
        # Clean up temp file
        if self.temp_file and self.temp_file.exists():
            self.temp_file.unlink()
        if self.temp_dir:
            import shutil
            shutil.rmtree(self.temp_dir, ignore_errors=True)

    def read_lines(self) -> list[str]:
        """Read all lines from the temp audit log file."""
        if not self.temp_file.exists():
            return []
        with open(self.temp_file, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]

    def read_events(self) -> list[dict]:
        """Read and parse all events from the temp audit log file."""
        lines = self.read_lines()
        events = []
        for line in lines:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return events


# --- Property Tests ---


class TestAuditLogMonotonicGrowth:
    """P11a: For any sequence of log_audit_event() calls, the total number of
    events only increases (never decreases)."""

    @given(
        event_data=st.lists(
            st.tuples(user_ids, actions, resources, results),
            min_size=2,
            max_size=6,
        )
    )
    @settings(max_examples=30, suppress_health_check=[HealthCheck.too_slow], deadline=None)
    def test_event_count_monotonically_increases(
        self, event_data: list[tuple[str, str, str, str]]
    ):
        """After each log_audit_event() call, the total event count must be >= previous count."""
        with TempAuditFileContext() as ctx:
            previous_count = 0

            for user_id, action, resource, result in event_data:
                log_audit_event(
                    user_id=user_id,
                    action=action,
                    resource=resource,
                    result=result,
                )
                current_count = len(ctx.read_events())

                assert current_count >= previous_count, (
                    f"Event count decreased from {previous_count} to {current_count} "
                    f"after logging event for user={user_id}, action={action}"
                )
                assert current_count == previous_count + 1, (
                    f"Expected count to increase by exactly 1, but went from "
                    f"{previous_count} to {current_count}"
                )
                previous_count = current_count


class TestAuditLogDataImmutability:
    """P11b: For any logged event, its data is unchanged when queried later
    (no modification possible)."""

    @given(
        user_id=user_ids,
        action=actions,
        resource=resources,
        result=results,
        ip_address=ip_addresses,
        detail=details,
    )
    @settings(max_examples=30, suppress_health_check=[HealthCheck.too_slow], deadline=None)
    def test_logged_event_data_unchanged_on_query(
        self,
        user_id: str,
        action: str,
        resource: str,
        result: str,
        ip_address: str,
        detail: dict | None,
    ):
        """A logged event's data must be identical when retrieved via query."""
        with TempAuditFileContext() as ctx:
            # Log the event
            event = log_audit_event(
                user_id=user_id,
                action=action,
                resource=resource,
                result=result,
                ip_address=ip_address,
                details=detail,
            )

            # Read back from file
            stored_events = ctx.read_events()
            assert len(stored_events) == 1, (
                f"Expected exactly 1 stored event, got {len(stored_events)}"
            )

            stored = stored_events[0]

            # Verify core fields are unchanged
            assert stored["user_id"] == user_id, (
                f"user_id mismatch: stored={stored['user_id']}, expected={user_id}"
            )
            assert stored["action"] == action, (
                f"action mismatch: stored={stored['action']}, expected={action}"
            )
            assert stored["resource"] == resource, (
                f"resource mismatch: stored={stored['resource']}, expected={resource}"
            )
            assert stored["result"] == result, (
                f"result mismatch: stored={stored['result']}, expected={result}"
            )
            assert stored["id"] == event.id, (
                f"id mismatch: stored={stored['id']}, expected={event.id}"
            )
            assert stored["timestamp"] == event.timestamp, (
                f"timestamp mismatch: stored={stored['timestamp']}, expected={event.timestamp}"
            )
            if ip_address:
                assert stored["ip_address"] == ip_address
            if detail:
                assert stored["details"] == detail

    @given(
        events_data=st.lists(
            st.tuples(user_ids, actions, resources, results),
            min_size=3,
            max_size=6,
        )
    )
    @settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow], deadline=None)
    def test_earlier_events_unchanged_after_new_writes(
        self, events_data: list[tuple[str, str, str, str]]
    ):
        """Earlier logged events must not be modified when new events are written."""
        with TempAuditFileContext() as ctx:
            snapshots: list[list[dict]] = []

            for user_id, action, resource, result in events_data:
                log_audit_event(
                    user_id=user_id,
                    action=action,
                    resource=resource,
                    result=result,
                )
                # Take a snapshot of all events after each write
                snapshots.append(ctx.read_events())

            # Verify that earlier events in each snapshot are preserved
            for i in range(len(snapshots) - 1):
                earlier = snapshots[i]
                later = snapshots[i + 1]

                # All events from earlier snapshot must appear unchanged in later
                for j, event in enumerate(earlier):
                    assert later[j] == event, (
                        f"Event at index {j} was modified between snapshot {i} and {i+1}. "
                        f"Before: {event}, After: {later[j]}"
                    )


class TestAuditLogFileAppendOnly:
    """P11c: The file-based fallback is append-only (existing lines never change)."""

    @given(
        events_data=st.lists(
            st.tuples(user_ids, actions, resources),
            min_size=2,
            max_size=6,
        )
    )
    @settings(max_examples=30, suppress_health_check=[HealthCheck.too_slow], deadline=None)
    def test_file_lines_are_append_only(
        self, events_data: list[tuple[str, str, str]]
    ):
        """Existing lines in the audit JSONL file must never change; new events only append."""
        with TempAuditFileContext() as ctx:
            previous_lines: list[str] = []

            for user_id, action, resource in events_data:
                log_audit_event(
                    user_id=user_id,
                    action=action,
                    resource=resource,
                    result="success",
                )
                current_lines = ctx.read_lines()

                # All previous lines must be preserved exactly
                for idx, prev_line in enumerate(previous_lines):
                    assert idx < len(current_lines), (
                        f"Line {idx} was removed! Previous had {len(previous_lines)} lines, "
                        f"now has {len(current_lines)}"
                    )
                    assert current_lines[idx] == prev_line, (
                        f"Line {idx} was modified!\n"
                        f"  Before: {prev_line}\n"
                        f"  After:  {current_lines[idx]}"
                    )

                # New file must have exactly one more line
                assert len(current_lines) == len(previous_lines) + 1, (
                    f"Expected {len(previous_lines) + 1} lines, got {len(current_lines)}"
                )

                previous_lines = current_lines


class TestAuditLogNoRemoval:
    """P11d: Once an event is logged, it cannot be removed from the log."""

    @given(
        events_data=st.lists(
            st.tuples(user_ids, actions, resources, results),
            min_size=3,
            max_size=6,
        )
    )
    @settings(max_examples=30, suppress_health_check=[HealthCheck.too_slow], deadline=None)
    def test_logged_events_cannot_be_removed(
        self, events_data: list[tuple[str, str, str, str]]
    ):
        """All logged event IDs must persist in the log — none can disappear."""
        with TempAuditFileContext() as ctx:
            logged_ids: list[str] = []

            for user_id, action, resource, result in events_data:
                event = log_audit_event(
                    user_id=user_id,
                    action=action,
                    resource=resource,
                    result=result,
                )
                logged_ids.append(event.id)

            # Verify ALL logged IDs are present in the final file
            final_events = ctx.read_events()
            final_ids = {e["id"] for e in final_events}

            for event_id in logged_ids:
                assert event_id in final_ids, (
                    f"Event {event_id} was logged but is missing from the audit log. "
                    f"This violates the immutability/retention requirement."
                )

            # Verify count matches exactly (no phantom additions either)
            assert len(final_events) == len(logged_ids), (
                f"Expected {len(logged_ids)} events, found {len(final_events)}. "
                f"Events may have been added or removed unexpectedly."
            )

    @given(
        user_id=user_ids,
        action=actions,
        resource=resources,
    )
    @settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow], deadline=None)
    def test_query_returns_all_logged_events(
        self, user_id: str, action: str, resource: str
    ):
        """query_audit_events must return previously logged events (retention guarantee)."""
        with TempAuditFileContext() as ctx:
            # Log multiple events with same user_id
            events = []
            for _ in range(3):
                event = log_audit_event(
                    user_id=user_id,
                    action=action,
                    resource=resource,
                    result="success",
                )
                events.append(event)

            # Query by user_id
            result = query_audit_events(user_id=user_id)

            assert result["total"] == 3, (
                f"Expected 3 events for user {user_id}, got {result['total']}"
            )

            # All event IDs must be present in query results
            result_ids = {e["id"] for e in result["data"]}
            for event in events:
                assert event.id in result_ids, (
                    f"Event {event.id} not found in query results. "
                    f"Retention guarantee violated."
                )
