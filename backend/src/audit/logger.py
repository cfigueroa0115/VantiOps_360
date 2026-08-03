"""
Audit Logger module for VantiOps 360.

Provides synchronous, append-only audit event logging to the `audit_events`
PostgreSQL table (via Neon) with a file-based fallback when no live DB
connection is available.

Requirements:
  - REQ-14.1: Log each action with timestamp, user_id, action, resource, result, IP.
  - REQ-14.2: Append-only storage — no UPDATE or DELETE permitted.
  - REQ-14.3: Synchronous write — audit event written BEFORE response returns.
  - REQ-14.4: Immutable retention (minimum 12 months).
  - REQ-14.5: Filtered queries by date range, user_id, action, resource with pagination.

Design:
  - Primary target: INSERT into `audit_events` table in Neon PostgreSQL.
  - Fallback: Append JSON lines to `data/audit/audit_log.jsonl` when DB is unavailable.
  - Uses the centralized retry policy from `backend.src.core.retry` for transient DB errors.
  - CRITICAL: This function is synchronous (blocking) — the audit event MUST be
    persisted before the calling function returns.

Table schema (from migration 010):
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(500) NOT NULL,
  resource_id VARCHAR(200),
  result VARCHAR(10) NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
  ip_address INET,
  details JSONB,
  correlation_id UUID
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.retry import retry_policy

logger = logging.getLogger(__name__)

# Fallback file path for audit log when DB is not available
AUDIT_LOG_DIR = Path("data/audit")
AUDIT_LOG_FILE = AUDIT_LOG_DIR / "audit_log.jsonl"

# Database connection string environment variable
DATABASE_URL_ENV = "DATABASE_URL"
NEON_DATABASE_URL_ENV = "NEON_DATABASE_URL"


@dataclass
class AuditEvent:
    """Represents an audit event to be logged.

    All fields align with the `audit_events` table schema from migration 010.
    """

    user_id: str
    action: str
    resource: str
    resource_id: str | None = None
    result: str = "success"
    ip_address: str | None = None
    details: dict[str, Any] | None = None
    correlation_id: str | None = None
    # Auto-generated fields
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def __post_init__(self) -> None:
        """Validate the audit event fields."""
        if not self.user_id:
            raise ValueError("user_id is required for audit events")
        if not self.action:
            raise ValueError("action is required for audit events")
        if not self.resource:
            raise ValueError("resource is required for audit events")
        if self.result not in ("success", "failure"):
            raise ValueError(f"result must be 'success' or 'failure', got '{self.result}'")

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        data = asdict(self)
        # Remove None values for cleaner output
        return {k: v for k, v in data.items() if v is not None}


def _get_database_url() -> str | None:
    """Get the database connection URL from environment variables."""
    return os.environ.get(DATABASE_URL_ENV) or os.environ.get(NEON_DATABASE_URL_ENV)


def _write_to_db(event: AuditEvent) -> bool:
    """Write an audit event to the PostgreSQL audit_events table.

    Uses psycopg2 for synchronous DB operations with the retry policy
    for transient connection errors.

    Returns:
        True if the write was successful, False otherwise.
    """
    db_url = _get_database_url()
    if not db_url:
        return False

    try:
        import psycopg2  # type: ignore[import-untyped]
    except ImportError:
        logger.warning("psycopg2 not available, falling back to file-based audit log")
        return False

    @retry_policy(max_retries=3, base_delay=1.0, max_delay=10.0, jitter=0.3)
    def _insert() -> None:
        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_events
                        (id, timestamp, user_id, action, resource, resource_id,
                         result, ip_address, details, correlation_id)
                    VALUES
                        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        event.id,
                        event.timestamp,
                        event.user_id,
                        event.action,
                        event.resource,
                        event.resource_id,
                        event.result,
                        event.ip_address,
                        json.dumps(event.details) if event.details else None,
                        event.correlation_id,
                    ),
                )
            conn.commit()
        finally:
            conn.close()

    try:
        _insert()
        return True
    except Exception as e:
        logger.error("Failed to write audit event to database: %s", str(e))
        return False


def _write_to_file(event: AuditEvent) -> bool:
    """Write an audit event to the JSONL fallback file.

    This is the fallback mechanism when the database is unavailable.
    Writes are append-only to data/audit/audit_log.jsonl.

    Returns:
        True if the write was successful, False otherwise.
    """
    try:
        AUDIT_LOG_DIR.mkdir(parents=True, exist_ok=True)
        with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(event.to_dict(), default=str) + "\n")
        return True
    except Exception as e:
        logger.error("Failed to write audit event to file: %s", str(e))
        return False


def log_audit_event(
    user_id: str,
    action: str,
    resource: str,
    resource_id: str | None = None,
    result: str = "success",
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
    correlation_id: str | None = None,
) -> AuditEvent:
    """Log an audit event synchronously (BEFORE the response is returned).

    This function creates and persists an audit event. It first attempts to write
    to the PostgreSQL `audit_events` table. If the DB is unavailable, it falls back
    to writing to the local JSONL file at `data/audit/audit_log.jsonl`.

    CRITICAL: This is a synchronous operation per REQ-14.3.
    The audit event MUST be persisted before the calling function returns.

    Args:
        user_id: Identifier of the user performing the action.
        action: The action verb (e.g., "LOGIN", "CREATE_ANNULATION", "ACCESS_DENIED").
        resource: The resource path or entity (e.g., "/api/annulations", "cancellation_request").
        resource_id: Optional ID of the specific resource affected.
        result: Outcome of the action — "success" or "failure".
        details: Optional JSONB-compatible dict with additional context.
        ip_address: IP address of the request origin.
        correlation_id: Optional UUID to correlate related events.

    Returns:
        The AuditEvent instance that was logged.

    Raises:
        ValueError: If required fields are missing or result is invalid.
        RuntimeError: If both DB and file fallback fail (critical audit failure).

    Examples:
        >>> event = log_audit_event(
        ...     user_id="user-123",
        ...     action="LOGIN",
        ...     resource="/api/auth",
        ...     result="success",
        ...     ip_address="192.168.1.1"
        ... )
        >>> event.action
        'LOGIN'
    """
    # Create the audit event (validates fields)
    event = AuditEvent(
        user_id=user_id,
        action=action,
        resource=resource,
        resource_id=resource_id,
        result=result,
        ip_address=ip_address,
        details=details,
        correlation_id=correlation_id,
    )

    # Attempt DB write first (primary storage)
    db_success = _write_to_db(event)

    if db_success:
        logger.debug("Audit event %s written to database", event.id)
        return event

    # Fallback to file-based storage
    file_success = _write_to_file(event)

    if file_success:
        logger.info("Audit event %s written to file fallback (DB unavailable)", event.id)
        return event

    # Both storage mechanisms failed — this is critical
    raise RuntimeError(
        f"CRITICAL: Failed to persist audit event {event.id}. "
        "Both database and file fallback are unavailable."
    )


def query_audit_events(
    date_start: str | None = None,
    date_end: str | None = None,
    user_id: str | None = None,
    action: str | None = None,
    resource: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """Query audit events with filtering and pagination.

    Reads from the file-based fallback (JSONL) when no DB connection
    is available. With DB, queries the audit_events table directly.

    Args:
        date_start: ISO-8601 start date filter (inclusive).
        date_end: ISO-8601 end date filter (inclusive).
        user_id: Filter by user identifier.
        action: Filter by action type.
        resource: Filter by resource path/entity.
        page: Page number (1-indexed).
        page_size: Number of results per page.

    Returns:
        Dictionary with: data (list of events), total (count), page, pageSize.
    """
    # Try DB first
    db_url = _get_database_url()
    if db_url:
        try:
            return _query_from_db(
                date_start=date_start,
                date_end=date_end,
                user_id=user_id,
                action=action,
                resource=resource,
                page=page,
                page_size=page_size,
            )
        except Exception as e:
            logger.warning("DB query failed, falling back to file: %s", str(e))

    # Fallback to file-based query
    return _query_from_file(
        date_start=date_start,
        date_end=date_end,
        user_id=user_id,
        action=action,
        resource=resource,
        page=page,
        page_size=page_size,
    )


def _query_from_db(
    date_start: str | None = None,
    date_end: str | None = None,
    user_id: str | None = None,
    action: str | None = None,
    resource: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """Query audit events from PostgreSQL with filters and pagination."""
    import psycopg2  # type: ignore[import-untyped]

    db_url = _get_database_url()
    if not db_url:
        raise RuntimeError("No database URL configured")

    conditions: list[str] = []
    params: list[Any] = []
    param_idx = 1

    if date_start:
        conditions.append(f"timestamp >= ${param_idx}::timestamptz")
        params.append(date_start)
        param_idx += 1

    if date_end:
        conditions.append(f"timestamp <= ${param_idx}::timestamptz")
        params.append(date_end)
        param_idx += 1

    if user_id:
        conditions.append(f"user_id = ${param_idx}")
        params.append(user_id)
        param_idx += 1

    if action:
        conditions.append(f"action = ${param_idx}")
        params.append(action)
        param_idx += 1

    if resource:
        conditions.append(f"resource = ${param_idx}")
        params.append(resource)
        param_idx += 1

    where_clause = " AND ".join(conditions) if conditions else "1=1"
    offset = (page - 1) * page_size

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            # Get total count
            count_sql = f"SELECT COUNT(*) FROM audit_events WHERE {where_clause}"
            cur.execute(count_sql, params)
            total = cur.fetchone()[0]

            # Get paginated results
            data_sql = (
                f"SELECT id, timestamp, user_id, action, resource, resource_id, "
                f"result, ip_address, details, correlation_id "
                f"FROM audit_events WHERE {where_clause} "
                f"ORDER BY timestamp DESC "
                f"LIMIT {page_size} OFFSET {offset}"
            )
            cur.execute(data_sql, params)
            rows = cur.fetchall()

            data = []
            for row in rows:
                data.append({
                    "id": str(row[0]),
                    "timestamp": row[1].isoformat() if row[1] else None,
                    "userId": row[2],
                    "action": row[3],
                    "resource": row[4],
                    "resourceId": row[5],
                    "result": row[6],
                    "ipAddress": str(row[7]) if row[7] else None,
                    "details": row[8],
                    "correlationId": str(row[9]) if row[9] else None,
                })
    finally:
        conn.close()

    return {
        "data": data,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


def _query_from_file(
    date_start: str | None = None,
    date_end: str | None = None,
    user_id: str | None = None,
    action: str | None = None,
    resource: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """Query audit events from the JSONL fallback file with filters and pagination."""
    events: list[dict[str, Any]] = []

    if AUDIT_LOG_FILE.exists():
        with open(AUDIT_LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    events.append(event)
                except json.JSONDecodeError:
                    continue

    # Apply filters
    filtered = events
    if date_start:
        filtered = [e for e in filtered if e.get("timestamp", "") >= date_start]
    if date_end:
        filtered = [e for e in filtered if e.get("timestamp", "") <= date_end]
    if user_id:
        filtered = [e for e in filtered if e.get("user_id") == user_id]
    if action:
        filtered = [e for e in filtered if e.get("action") == action]
    if resource:
        filtered = [e for e in filtered if e.get("resource") == resource]

    # Sort by timestamp descending
    filtered.sort(key=lambda e: e.get("timestamp", ""), reverse=True)

    # Paginate
    total = len(filtered)
    offset = (page - 1) * page_size
    page_data = filtered[offset: offset + page_size]

    # Normalize keys for API response (camelCase)
    data = []
    for e in page_data:
        data.append({
            "id": e.get("id"),
            "timestamp": e.get("timestamp"),
            "userId": e.get("user_id"),
            "action": e.get("action"),
            "resource": e.get("resource"),
            "resourceId": e.get("resource_id"),
            "result": e.get("result"),
            "ipAddress": e.get("ip_address"),
            "details": e.get("details"),
            "correlationId": e.get("correlation_id"),
        })

    return {
        "data": data,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }
