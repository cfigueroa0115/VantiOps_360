"""
Email Management module for VantiOps 360.

Provides a directory of up to 2,000 email addresses with status tracking,
bulk operations requiring SYSTEM_ADMIN authorization, throttled sending,
and comprehensive audit logging.

Requirements:
  - REQ-22.1: Manage directory of up to 2,000 email addresses with status
              (activo/inactivo/suspendido) and last update date.
  - REQ-22.2: Bulk operations (activate/deactivate) requiring SYSTEM_ADMIN confirmation.
  - REQ-22.3: Throttled sending: max 100 emails/minute.
  - REQ-22.4: Log all communications to audit_events with: recipient, subject,
              timestamp, delivery status.

Storage: File-based JSON at data/config/email_directory.json
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from pathlib import Path
from typing import Any

from audit.logger import log_audit_event
from auth.rbac import is_authorized

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_DIRECTORY_SIZE = 2_000
MAX_EMAILS_PER_MINUTE = 100
EMAIL_DIRECTORY_PATH = Path("data/config/email_directory.json")


class EmailStatus(StrEnum):
    """Valid states for an email entry in the directory."""

    ACTIVO = "activo"
    INACTIVO = "inactivo"
    SUSPENDIDO = "suspendido"


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


@dataclass
class EmailEntry:
    """Represents a single email entry in the directory.

    Attributes:
        email: The email address.
        status: Current status (activo, inactivo, suspendido).
        updated_at: ISO-8601 timestamp of last status change.
    """

    email: str
    status: EmailStatus = EmailStatus.ACTIVO
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, str]:
        """Serialize to dictionary for JSON storage."""
        return {
            "email": self.email,
            "status": self.status.value,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> EmailEntry:
        """Deserialize from dictionary."""
        return cls(
            email=data["email"],
            status=EmailStatus(data["status"]),
            updated_at=data.get("updated_at", datetime.now(timezone.utc).isoformat()),
        )


# ---------------------------------------------------------------------------
# Throttled Sender
# ---------------------------------------------------------------------------


class ThrottledSender:
    """Rate-limited email sender enforcing max 100 emails/minute.

    Uses a sliding window approach to track send timestamps and enforce
    the rate limit. Thread-safe via a lock.

    REQ-22.3: Process notifications in batches of max 100 emails/minute.
    """

    def __init__(self, max_per_minute: int = MAX_EMAILS_PER_MINUTE) -> None:
        self._max_per_minute = max_per_minute
        self._send_timestamps: list[float] = []
        self._lock = threading.Lock()

    @property
    def max_per_minute(self) -> int:
        """Maximum emails allowed per minute."""
        return self._max_per_minute

    def _prune_old_timestamps(self) -> None:
        """Remove timestamps older than 60 seconds from the window."""
        cutoff = time.time() - 60.0
        self._send_timestamps = [ts for ts in self._send_timestamps if ts > cutoff]

    def can_send(self) -> bool:
        """Check if sending is allowed within the current rate limit.

        Returns:
            True if under the rate limit, False if throttled.
        """
        with self._lock:
            self._prune_old_timestamps()
            return len(self._send_timestamps) < self._max_per_minute

    def record_send(self) -> bool:
        """Record a send operation if within rate limit.

        Returns:
            True if the send was recorded (under limit), False if throttled.
        """
        with self._lock:
            self._prune_old_timestamps()
            if len(self._send_timestamps) >= self._max_per_minute:
                return False
            self._send_timestamps.append(time.time())
            return True

    def get_current_count(self) -> int:
        """Get the number of emails sent in the current 60-second window."""
        with self._lock:
            self._prune_old_timestamps()
            return len(self._send_timestamps)

    def wait_time_seconds(self) -> float:
        """Calculate how long to wait before the next send is allowed.

        Returns:
            Seconds to wait (0.0 if can send immediately).
        """
        with self._lock:
            self._prune_old_timestamps()
            if len(self._send_timestamps) < self._max_per_minute:
                return 0.0
            # Oldest timestamp in the window — wait until it expires
            oldest = self._send_timestamps[0]
            wait = (oldest + 60.0) - time.time()
            return max(0.0, wait)


# ---------------------------------------------------------------------------
# Email Directory
# ---------------------------------------------------------------------------


class EmailDirectory:
    """Manages a directory of up to 2,000 email entries.

    REQ-22.1: Directory with status (activo/inactivo/suspendido) and
    last update timestamp per entry.

    Storage: JSON file at data/config/email_directory.json.
    """

    def __init__(self, storage_path: Path | None = None) -> None:
        self._storage_path = storage_path or EMAIL_DIRECTORY_PATH
        self._entries: dict[str, EmailEntry] = {}
        self._throttler = ThrottledSender()
        self._load()

    # ----- Persistence -----

    def _load(self) -> None:
        """Load the email directory from the JSON file."""
        if self._storage_path.exists():
            try:
                data = json.loads(self._storage_path.read_text(encoding="utf-8"))
                for item in data.get("emails", []):
                    entry = EmailEntry.from_dict(item)
                    self._entries[entry.email.lower()] = entry
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.warning("Failed to load email directory: %s", e)
                self._entries = {}
        else:
            self._entries = {}

    def _save(self) -> None:
        """Persist the email directory to the JSON file."""
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "emails": [entry.to_dict() for entry in self._entries.values()],
            "total": len(self._entries),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._storage_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    # ----- Query -----

    @property
    def size(self) -> int:
        """Current number of entries in the directory."""
        return len(self._entries)

    def get_entry(self, email: str) -> EmailEntry | None:
        """Get a single email entry by address."""
        return self._entries.get(email.lower())

    def list_entries(
        self,
        status: EmailStatus | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        """List entries with optional status filter and pagination."""
        entries = list(self._entries.values())
        if status is not None:
            entries = [e for e in entries if e.status == status]

        total = len(entries)
        offset = (page - 1) * page_size
        page_data = entries[offset : offset + page_size]

        return {
            "data": [e.to_dict() for e in page_data],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }

    # ----- Add / Remove -----

    def add_email(self, email: str, admin_id: str) -> bool:
        """Add a new email entry to the directory.

        Args:
            email: The email address to add.
            admin_id: The user performing the operation (must be SYSTEM_ADMIN).

        Returns:
            True if added, False if directory is full or email already exists.

        Raises:
            PermissionError: If admin_id does not have SYSTEM_ADMIN role.
        """
        if not is_authorized(admin_id, "MANAGE_CONFIG"):
            raise PermissionError(
                f"User '{admin_id}' is not authorized for email directory management. "
                "SYSTEM_ADMIN role required."
            )

        normalized = email.lower().strip()
        if normalized in self._entries:
            return False

        if len(self._entries) >= MAX_DIRECTORY_SIZE:
            log_audit_event(
                user_id=admin_id,
                action="EMAIL_ADD_REJECTED",
                resource="email_directory",
                resource_id=normalized,
                result="failure",
                details={"reason": "directory_full", "max_size": MAX_DIRECTORY_SIZE},
            )
            return False

        self._entries[normalized] = EmailEntry(email=normalized)
        self._save()

        log_audit_event(
            user_id=admin_id,
            action="EMAIL_ADDED",
            resource="email_directory",
            resource_id=normalized,
            result="success",
        )
        return True

    def remove_email(self, email: str, admin_id: str) -> bool:
        """Remove an email from the directory.

        Args:
            email: The email address to remove.
            admin_id: The user performing the operation (must be SYSTEM_ADMIN).

        Returns:
            True if removed, False if not found.

        Raises:
            PermissionError: If admin_id does not have SYSTEM_ADMIN role.
        """
        if not is_authorized(admin_id, "MANAGE_CONFIG"):
            raise PermissionError(
                f"User '{admin_id}' is not authorized. SYSTEM_ADMIN role required."
            )

        normalized = email.lower().strip()
        if normalized not in self._entries:
            return False

        del self._entries[normalized]
        self._save()

        log_audit_event(
            user_id=admin_id,
            action="EMAIL_REMOVED",
            resource="email_directory",
            resource_id=normalized,
            result="success",
        )
        return True

    # ----- Bulk Operations (REQ-22.2) -----

    def activate_emails(self, emails: list[str], admin_id: str) -> int:
        """Bulk activate emails in the directory.

        REQ-22.2: Requires SYSTEM_ADMIN confirmation (verified via RBAC).

        Args:
            emails: List of email addresses to activate.
            admin_id: The admin performing the operation (role checked first).

        Returns:
            Number of emails successfully activated.

        Raises:
            PermissionError: If admin_id is not SYSTEM_ADMIN.
        """
        # Verify SYSTEM_ADMIN role immediately (REQ-22.2)
        if not is_authorized(admin_id, "MANAGE_CONFIG"):
            log_audit_event(
                user_id=admin_id,
                action="BULK_ACTIVATE_DENIED",
                resource="email_directory",
                result="failure",
                details={"reason": "insufficient_permissions", "count": len(emails)},
            )
            raise PermissionError(
                f"User '{admin_id}' is not authorized for bulk operations. "
                "SYSTEM_ADMIN role required."
            )

        activated_count = 0
        now = datetime.now(timezone.utc).isoformat()

        for email in emails:
            normalized = email.lower().strip()
            entry = self._entries.get(normalized)
            if entry and entry.status != EmailStatus.ACTIVO:
                entry.status = EmailStatus.ACTIVO
                entry.updated_at = now
                activated_count += 1

        if activated_count > 0:
            self._save()

        # Audit the bulk operation (REQ-22.4)
        log_audit_event(
            user_id=admin_id,
            action="BULK_ACTIVATE",
            resource="email_directory",
            result="success",
            details={
                "requested": len(emails),
                "activated": activated_count,
            },
        )

        return activated_count

    def deactivate_emails(self, emails: list[str], admin_id: str) -> int:
        """Bulk deactivate emails in the directory.

        REQ-22.2: Requires SYSTEM_ADMIN confirmation (verified via RBAC).

        Args:
            emails: List of email addresses to deactivate.
            admin_id: The admin performing the operation (role checked first).

        Returns:
            Number of emails successfully deactivated.

        Raises:
            PermissionError: If admin_id is not SYSTEM_ADMIN.
        """
        # Verify SYSTEM_ADMIN role immediately (REQ-22.2)
        if not is_authorized(admin_id, "MANAGE_CONFIG"):
            log_audit_event(
                user_id=admin_id,
                action="BULK_DEACTIVATE_DENIED",
                resource="email_directory",
                result="failure",
                details={"reason": "insufficient_permissions", "count": len(emails)},
            )
            raise PermissionError(
                f"User '{admin_id}' is not authorized for bulk operations. "
                "SYSTEM_ADMIN role required."
            )

        deactivated_count = 0
        now = datetime.now(timezone.utc).isoformat()

        for email in emails:
            normalized = email.lower().strip()
            entry = self._entries.get(normalized)
            if entry and entry.status != EmailStatus.INACTIVO:
                entry.status = EmailStatus.INACTIVO
                entry.updated_at = now
                deactivated_count += 1

        if deactivated_count > 0:
            self._save()

        # Audit the bulk operation (REQ-22.4)
        log_audit_event(
            user_id=admin_id,
            action="BULK_DEACTIVATE",
            resource="email_directory",
            result="success",
            details={
                "requested": len(emails),
                "deactivated": deactivated_count,
            },
        )

        return deactivated_count

    # ----- Send Email (REQ-22.3, REQ-22.4) -----

    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        sender_id: str,
    ) -> bool:
        """Send an email with throttle enforcement.

        REQ-22.3: Max 100 emails/minute rate limit.
        REQ-22.4: Log all communications to audit_events.

        Args:
            to: Recipient email address.
            subject: Email subject line.
            body: Email body content.
            sender_id: ID of the user initiating the send.

        Returns:
            True if the email was sent (or queued for sending),
            False if throttled or recipient not in directory.
        """
        normalized_to = to.lower().strip()

        # Verify recipient is in the directory and active
        entry = self._entries.get(normalized_to)
        if entry is None:
            log_audit_event(
                user_id=sender_id,
                action="EMAIL_SEND_REJECTED",
                resource="email_directory",
                resource_id=normalized_to,
                result="failure",
                details={"reason": "recipient_not_in_directory", "subject": subject},
            )
            return False

        if entry.status != EmailStatus.ACTIVO:
            log_audit_event(
                user_id=sender_id,
                action="EMAIL_SEND_REJECTED",
                resource="email_directory",
                resource_id=normalized_to,
                result="failure",
                details={
                    "reason": "recipient_inactive",
                    "status": entry.status.value,
                    "subject": subject,
                },
            )
            return False

        # Check throttle (REQ-22.3)
        if not self._throttler.record_send():
            log_audit_event(
                user_id=sender_id,
                action="EMAIL_SEND_THROTTLED",
                resource="email_directory",
                resource_id=normalized_to,
                result="failure",
                details={
                    "reason": "rate_limit_exceeded",
                    "max_per_minute": MAX_EMAILS_PER_MINUTE,
                    "subject": subject,
                },
            )
            return False

        # Simulate sending (actual SMTP integration is out of scope)
        # In production, this would call an email service provider
        delivery_status = "sent"

        # Log communication to audit (REQ-22.4)
        log_audit_event(
            user_id=sender_id,
            action="EMAIL_SENT",
            resource="email_directory",
            resource_id=normalized_to,
            result="success",
            details={
                "recipient": normalized_to,
                "subject": subject,
                "delivery_status": delivery_status,
            },
        )

        return True

    # ----- Utility -----

    def get_throttler(self) -> ThrottledSender:
        """Get the throttler instance for inspection/testing."""
        return self._throttler
