"""
Approvals Engine for VantiOps 360.

Implements the governance approval workflow for critical operations
requiring explicit authorization from LEGAL_APPROVER and/or VP_APPROVER.

Requirements:
  - REQ-15.1: Block execution until approval by correct role is received.
  - REQ-15.2: Maintain approval record with approver, date, operation,
              justification (≥10 chars), and status.
  - REQ-15.3: Define operations requiring approval: production migrations,
              RBAC changes, data deletion, security config changes.
  - REQ-15.4: 72-hour expiration with auto-invalidation and require new request.

Design:
  - Operations map to required approver roles (LEGAL_APPROVER and/or VP_APPROVER).
  - Each approval request has a 72-hour TTL from creation.
  - Expired approvals are auto-invalidated and block execution.
  - All approval actions (request, approve, reject, expire) generate audit events.
  - Primary storage: approval_steps + approval_events tables in Neon PostgreSQL.
  - Fallback: file-based JSON storage at data/governance/approvals.json.

Table schemas (from migration 008):
  approval_steps: id, application_id, step_order, approver_role, status,
                  approved_by, justification, approved_at, expires_at, created_at
  approval_events: id, step_id, event_type, actor_id, actor_role,
                   justification, timestamp, ip_address
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from pathlib import Path
from typing import Any

from audit.logger import log_audit_event

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# 72-hour expiration window for approvals (REQ-15.4)
APPROVAL_EXPIRATION_HOURS = 72

# Minimum justification length (REQ-15.2)
MIN_JUSTIFICATION_LENGTH = 10

# File-based fallback storage
APPROVALS_DIR = Path("data/governance")
APPROVALS_FILE = APPROVALS_DIR / "approvals.json"


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ApprovalStatus(StrEnum):
    """Status of an approval request."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class OperationType(StrEnum):
    """Operations that require approval per REQ-15.3.

    - PRODUCTION_MIGRATION: Migrations to production environment.
    - RBAC_CHANGE: Changes to role assignments or permissions.
    - DATA_DELETION: Deletion of data records.
    - SECURITY_CONFIG_CHANGE: Changes to security configuration.
    """

    PRODUCTION_MIGRATION = "PRODUCTION_MIGRATION"
    RBAC_CHANGE = "RBAC_CHANGE"
    DATA_DELETION = "DATA_DELETION"
    SECURITY_CONFIG_CHANGE = "SECURITY_CONFIG_CHANGE"


# ---------------------------------------------------------------------------
# Operation → Required Approver Roles mapping (REQ-15.3)
# ---------------------------------------------------------------------------

OPERATION_REQUIRED_APPROVERS: dict[OperationType, list[str]] = {
    OperationType.PRODUCTION_MIGRATION: ["VP_APPROVER"],
    OperationType.RBAC_CHANGE: ["LEGAL_APPROVER", "VP_APPROVER"],
    OperationType.DATA_DELETION: ["LEGAL_APPROVER"],
    OperationType.SECURITY_CONFIG_CHANGE: ["LEGAL_APPROVER", "VP_APPROVER"],
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class ApprovalRequest:
    """Represents a request for approval of a critical operation.

    Attributes:
        id: Unique identifier for the approval request.
        operation: The type of operation requiring approval.
        requester_id: User ID of who requested the approval.
        approver_role: Required approver role (LEGAL_APPROVER or VP_APPROVER).
        justification: Reason for the operation (≥10 chars).
        status: Current status of the approval.
        requested_at: ISO-8601 timestamp when requested.
        expires_at: ISO-8601 timestamp when approval expires (requested_at + 72h).
        approved_by: User ID of the approver (set on approve/reject).
        approved_at: ISO-8601 timestamp of approval/rejection.
    """

    operation: str
    requester_id: str
    approver_role: str
    justification: str
    status: ApprovalStatus = ApprovalStatus.PENDING
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    requested_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    expires_at: str = field(default="")
    approved_by: str | None = None
    approved_at: str | None = None

    def __post_init__(self) -> None:
        """Validate and set computed fields."""
        if not self.operation:
            raise ValueError("operation is required")
        if not self.requester_id:
            raise ValueError("requester_id is required")
        if not self.approver_role:
            raise ValueError("approver_role is required")
        if self.approver_role not in ("LEGAL_APPROVER", "VP_APPROVER"):
            raise ValueError(
                f"approver_role must be 'LEGAL_APPROVER' or "
                f"'VP_APPROVER', got '{self.approver_role}'"
            )
        if not self.justification or len(self.justification) < MIN_JUSTIFICATION_LENGTH:
            raise ValueError(
                f"justification must be at least {MIN_JUSTIFICATION_LENGTH} characters"
            )
        # Compute expires_at if not set
        if not self.expires_at:
            requested = datetime.fromisoformat(self.requested_at)
            self.expires_at = (requested + timedelta(hours=APPROVAL_EXPIRATION_HOURS)).isoformat()

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        data = asdict(self)
        return {k: v for k, v in data.items() if v is not None}

    @property
    def is_expired(self) -> bool:
        """Check if the approval has passed its 72-hour window."""
        now = datetime.now(timezone.utc)
        expires = datetime.fromisoformat(self.expires_at)
        return now > expires


@dataclass
class ApprovalResponse:
    """Response object for approval operations."""

    success: bool
    message: str
    approval: ApprovalRequest | None = None
    error_code: str | None = None


# ---------------------------------------------------------------------------
# Storage (file-based fallback)
# ---------------------------------------------------------------------------


def _load_approvals() -> list[dict[str, Any]]:
    """Load approvals from file storage."""
    if not APPROVALS_FILE.exists():
        return []
    try:
        with open(APPROVALS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def _save_approvals(approvals: list[dict[str, Any]]) -> None:
    """Persist approvals to file storage."""
    APPROVALS_DIR.mkdir(parents=True, exist_ok=True)
    with open(APPROVALS_FILE, "w", encoding="utf-8") as f:
        json.dump(approvals, f, indent=2, default=str)


def _find_approval(approval_id: str) -> dict[str, Any] | None:
    """Find an approval by ID in file storage."""
    approvals = _load_approvals()
    for approval in approvals:
        if approval.get("id") == approval_id:
            return approval
    return None


def _update_approval(approval_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    """Update an approval record in file storage."""
    approvals = _load_approvals()
    for i, approval in enumerate(approvals):
        if approval.get("id") == approval_id:
            approvals[i].update(updates)
            _save_approvals(approvals)
            return approvals[i]
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def request_approval(
    operation: str,
    requester_id: str,
    approver_role: str,
    justification: str,
    ip_address: str | None = None,
) -> ApprovalResponse:
    """Create a new approval request for a critical operation.

    Validates that the operation is one that requires approval (REQ-15.3),
    that the justification meets minimum length (REQ-15.2), and sets the
    72-hour expiration window (REQ-15.4).

    Args:
        operation: Operation type (must be a valid OperationType value).
        requester_id: User ID of the requester.
        approver_role: Required approver role ('LEGAL_APPROVER' or 'VP_APPROVER').
        justification: Reason for the operation (≥10 chars).
        ip_address: Optional IP address of the requester.

    Returns:
        ApprovalResponse with the created approval request or error details.

    Raises:
        ValueError: If operation type, approver_role, or justification is invalid.

    Examples:
        >>> resp = request_approval(
        ...     operation="PRODUCTION_MIGRATION",
        ...     requester_id="admin-001",
        ...     approver_role="VP_APPROVER",
        ...     justification="Deploying Q1 release to production environment"
        ... )
        >>> resp.success
        True
        >>> resp.approval.status
        'pending'
    """
    # Validate operation type (REQ-15.3)
    try:
        op_type = OperationType(operation)
    except ValueError:
        return ApprovalResponse(
            success=False,
            message=f"Invalid operation type: '{operation}'. "
            f"Valid types: {[o.value for o in OperationType]}",
            error_code="INVALID_OPERATION",
        )

    # Validate approver_role is appropriate for this operation
    required_roles = OPERATION_REQUIRED_APPROVERS.get(op_type, [])
    if approver_role not in required_roles:
        return ApprovalResponse(
            success=False,
            message=f"Operation '{operation}' requires approval from {required_roles}, "
            f"not '{approver_role}'",
            error_code="INVALID_APPROVER_ROLE",
        )

    # Create the approval request (validates justification length internally)
    try:
        approval = ApprovalRequest(
            operation=operation,
            requester_id=requester_id,
            approver_role=approver_role,
            justification=justification,
        )
    except ValueError as e:
        return ApprovalResponse(
            success=False,
            message=str(e),
            error_code="VALIDATION_ERROR",
        )

    # Persist to storage
    approvals = _load_approvals()
    approvals.append(approval.to_dict())
    _save_approvals(approvals)

    # Log audit event
    log_audit_event(
        user_id=requester_id,
        action="APPROVAL_REQUESTED",
        resource="/api/approvals",
        resource_id=approval.id,
        result="success",
        details={
            "operation": operation,
            "approver_role": approver_role,
            "expires_at": approval.expires_at,
        },
        ip_address=ip_address,
    )

    logger.info(
        "Approval request %s created for operation %s (expires: %s)",
        approval.id,
        operation,
        approval.expires_at,
    )

    return ApprovalResponse(
        success=True,
        message="Approval request created successfully",
        approval=approval,
    )


def approve_request(
    approval_id: str,
    approver_id: str,
    approver_role: str,
    justification: str,
    ip_address: str | None = None,
) -> ApprovalResponse:
    """Approve a pending approval request (REQ-15.1).

    The approver must have the correct role (LEGAL_APPROVER or VP_APPROVER)
    matching what the approval step requires.

    Args:
        approval_id: ID of the approval to approve.
        approver_id: User ID of the approver.
        approver_role: Role of the approver.
        justification: Approval justification (≥10 chars).
        ip_address: Optional IP address.

    Returns:
        ApprovalResponse with the updated approval or error details.

    Examples:
        >>> resp = approve_request(
        ...     approval_id="some-uuid",
        ...     approver_id="legal-001",
        ...     approver_role="LEGAL_APPROVER",
        ...     justification="Reviewed and confirmed compliance requirements"
        ... )
    """
    # Validate justification length
    if not justification or len(justification) < MIN_JUSTIFICATION_LENGTH:
        return ApprovalResponse(
            success=False,
            message=f"Justification must be at least {MIN_JUSTIFICATION_LENGTH} characters",
            error_code="VALIDATION_ERROR",
        )

    # Find the approval
    record = _find_approval(approval_id)
    if not record:
        return ApprovalResponse(
            success=False,
            message=f"Approval request '{approval_id}' not found",
            error_code="NOT_FOUND",
        )

    # Check current status
    if record.get("status") != ApprovalStatus.PENDING:
        return ApprovalResponse(
            success=False,
            message=f"Approval is not pending (current status: {record.get('status')})",
            error_code="INVALID_STATUS",
        )

    # Check expiration (REQ-15.4)
    expires_at = datetime.fromisoformat(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        # Auto-invalidate expired approval
        _update_approval(approval_id, {"status": ApprovalStatus.EXPIRED})
        log_audit_event(
            user_id=approver_id,
            action="APPROVAL_EXPIRED",
            resource="/api/approvals",
            resource_id=approval_id,
            result="failure",
            details={"reason": "72-hour expiration window exceeded"},
            ip_address=ip_address,
        )
        return ApprovalResponse(
            success=False,
            message="Approval has expired (72-hour window exceeded). A new request is required.",
            error_code="EXPIRED",
        )

    # Validate approver has correct role
    required_role = record.get("approver_role")
    if approver_role != required_role:
        log_audit_event(
            user_id=approver_id,
            action="APPROVAL_DENIED",
            resource="/api/approvals",
            resource_id=approval_id,
            result="failure",
            details={
                "reason": "role_mismatch",
                "required_role": required_role,
                "actual_role": approver_role,
            },
            ip_address=ip_address,
        )
        return ApprovalResponse(
            success=False,
            message=f"Approver must have role '{required_role}', not '{approver_role}'",
            error_code="ROLE_MISMATCH",
        )

    # Approve
    now = datetime.now(timezone.utc).isoformat()
    _update_approval(
        approval_id,
        {
            "status": ApprovalStatus.APPROVED,
            "approved_by": approver_id,
            "approved_at": now,
        },
    )

    # Log audit event
    log_audit_event(
        user_id=approver_id,
        action="APPROVAL_GRANTED",
        resource="/api/approvals",
        resource_id=approval_id,
        result="success",
        details={
            "operation": record.get("operation"),
            "justification": justification,
        },
        ip_address=ip_address,
    )

    # Reconstruct the updated approval
    updated_record = _find_approval(approval_id)
    assert updated_record is not None  # Just updated above, must exist
    updated_approval = ApprovalRequest(
        id=updated_record["id"],
        operation=updated_record["operation"],
        requester_id=updated_record["requester_id"],
        approver_role=updated_record["approver_role"],
        justification=updated_record["justification"],
        status=ApprovalStatus(updated_record["status"]),
        requested_at=updated_record["requested_at"],
        expires_at=updated_record["expires_at"],
        approved_by=updated_record.get("approved_by"),
        approved_at=updated_record.get("approved_at"),
    )

    return ApprovalResponse(
        success=True,
        message="Approval granted successfully",
        approval=updated_approval,
    )


def reject_request(
    approval_id: str,
    approver_id: str,
    approver_role: str,
    justification: str,
    ip_address: str | None = None,
) -> ApprovalResponse:
    """Reject a pending approval request.

    Args:
        approval_id: ID of the approval to reject.
        approver_id: User ID of the approver.
        approver_role: Role of the approver.
        justification: Rejection justification (≥10 chars).
        ip_address: Optional IP address.

    Returns:
        ApprovalResponse with the updated approval or error details.
    """
    # Validate justification length
    if not justification or len(justification) < MIN_JUSTIFICATION_LENGTH:
        return ApprovalResponse(
            success=False,
            message=f"Justification must be at least {MIN_JUSTIFICATION_LENGTH} characters",
            error_code="VALIDATION_ERROR",
        )

    # Find the approval
    record = _find_approval(approval_id)
    if not record:
        return ApprovalResponse(
            success=False,
            message=f"Approval request '{approval_id}' not found",
            error_code="NOT_FOUND",
        )

    # Check current status
    if record.get("status") != ApprovalStatus.PENDING:
        return ApprovalResponse(
            success=False,
            message=f"Approval is not pending (current status: {record.get('status')})",
            error_code="INVALID_STATUS",
        )

    # Check expiration (REQ-15.4)
    expires_at = datetime.fromisoformat(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        _update_approval(approval_id, {"status": ApprovalStatus.EXPIRED})
        return ApprovalResponse(
            success=False,
            message="Approval has expired (72-hour window exceeded). A new request is required.",
            error_code="EXPIRED",
        )

    # Validate approver has correct role
    required_role = record.get("approver_role")
    if approver_role != required_role:
        log_audit_event(
            user_id=approver_id,
            action="APPROVAL_REJECT_DENIED",
            resource="/api/approvals",
            resource_id=approval_id,
            result="failure",
            details={
                "reason": "role_mismatch",
                "required_role": required_role,
                "actual_role": approver_role,
            },
            ip_address=ip_address,
        )
        return ApprovalResponse(
            success=False,
            message=f"Approver must have role '{required_role}', not '{approver_role}'",
            error_code="ROLE_MISMATCH",
        )

    # Reject
    now = datetime.now(timezone.utc).isoformat()
    _update_approval(
        approval_id,
        {
            "status": ApprovalStatus.REJECTED,
            "approved_by": approver_id,
            "approved_at": now,
        },
    )

    # Log audit event
    log_audit_event(
        user_id=approver_id,
        action="APPROVAL_REJECTED",
        resource="/api/approvals",
        resource_id=approval_id,
        result="success",
        details={
            "operation": record.get("operation"),
            "justification": justification,
        },
        ip_address=ip_address,
    )

    updated_record = _find_approval(approval_id)
    assert updated_record is not None  # Just updated above, must exist
    updated_approval = ApprovalRequest(
        id=updated_record["id"],
        operation=updated_record["operation"],
        requester_id=updated_record["requester_id"],
        approver_role=updated_record["approver_role"],
        justification=updated_record["justification"],
        status=ApprovalStatus(updated_record["status"]),
        requested_at=updated_record["requested_at"],
        expires_at=updated_record["expires_at"],
        approved_by=updated_record.get("approved_by"),
        approved_at=updated_record.get("approved_at"),
    )

    return ApprovalResponse(
        success=True,
        message="Approval rejected",
        approval=updated_approval,
    )


def check_expiration(approval_id: str | None = None) -> list[str]:
    """Check and auto-invalidate expired approvals (REQ-15.4).

    If approval_id is provided, checks only that specific approval.
    Otherwise, checks ALL pending approvals for expiration.

    Returns:
        List of approval IDs that were expired by this check.

    Examples:
        >>> expired_ids = check_expiration()
        >>> # All pending approvals past 72h are now marked 'expired'
    """
    approvals = _load_approvals()
    now = datetime.now(timezone.utc)
    expired_ids: list[str] = []

    for approval in approvals:
        if approval.get("status") != ApprovalStatus.PENDING:
            continue

        if approval_id and approval.get("id") != approval_id:
            continue

        expires_at = datetime.fromisoformat(approval["expires_at"])
        if now > expires_at:
            _update_approval(approval["id"], {"status": ApprovalStatus.EXPIRED})
            expired_ids.append(approval["id"])

            # Log audit event for expiration
            log_audit_event(
                user_id="SYSTEM",
                action="APPROVAL_AUTO_EXPIRED",
                resource="/api/approvals",
                resource_id=approval["id"],
                result="success",
                details={
                    "operation": approval.get("operation"),
                    "expired_at": now.isoformat(),
                    "original_expires_at": approval["expires_at"],
                },
            )
            logger.info("Auto-expired approval %s (past 72h window)", approval["id"])

    return expired_ids


def get_pending_approvals(
    approver_role: str | None = None,
    operation: str | None = None,
) -> list[dict[str, Any]]:
    """Get pending approval requests, optionally filtered.

    Automatically checks and expires any overdue approvals before returning.

    Args:
        approver_role: Filter by required approver role.
        operation: Filter by operation type.

    Returns:
        List of pending approval records (as dicts).

    Examples:
        >>> pending = get_pending_approvals(approver_role="LEGAL_APPROVER")
        >>> # Returns only approvals awaiting legal sign-off
    """
    # Run expiration check first
    check_expiration()

    approvals = _load_approvals()
    pending = [a for a in approvals if a.get("status") == ApprovalStatus.PENDING]

    if approver_role:
        pending = [a for a in pending if a.get("approver_role") == approver_role]

    if operation:
        pending = [a for a in pending if a.get("operation") == operation]

    return pending


def is_operation_approved(
    operation: str,
    requester_id: str | None = None,
) -> bool:
    """Check if an operation has a valid (non-expired) approval (REQ-15.1).

    Used to determine whether execution of a critical operation should be
    allowed or blocked.

    Args:
        operation: The operation type to check.
        requester_id: Optional filter by requester.

    Returns:
        True if there is at least one approved and non-expired approval
        for the operation; False otherwise (execution should be blocked).

    Examples:
        >>> is_operation_approved("PRODUCTION_MIGRATION")
        False  # No approval exists, execution blocked
    """
    # Run expiration check first
    check_expiration()

    approvals = _load_approvals()
    now = datetime.now(timezone.utc)

    for approval in approvals:
        if approval.get("operation") != operation:
            continue
        if requester_id and approval.get("requester_id") != requester_id:
            continue
        if approval.get("status") != ApprovalStatus.APPROVED:
            continue

        # Check if the approved record is still within its expiration window
        expires_at = datetime.fromisoformat(approval["expires_at"])
        if now <= expires_at:
            return True

    return False
