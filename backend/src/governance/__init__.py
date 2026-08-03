"""
Governance module for VantiOps 360.

Provides the approvals engine for critical operations per REQ-15.
"""

from governance.approvals import (
    ApprovalStatus,
    OperationType,
    OPERATION_REQUIRED_APPROVERS,
    ApprovalRequest,
    ApprovalResponse,
    request_approval,
    approve_request,
    reject_request,
    check_expiration,
    get_pending_approvals,
    is_operation_approved,
)

__all__ = [
    "ApprovalStatus",
    "OperationType",
    "OPERATION_REQUIRED_APPROVERS",
    "ApprovalRequest",
    "ApprovalResponse",
    "request_approval",
    "approve_request",
    "reject_request",
    "check_expiration",
    "get_pending_approvals",
    "is_operation_approved",
]
