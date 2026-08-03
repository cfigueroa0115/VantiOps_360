"""
Unit tests for the governance approvals engine.

Tests:
  - ApprovalRequest creation and validation
  - request_approval with valid/invalid inputs
  - approve_request workflow
  - reject_request workflow
  - 72-hour expiration logic (REQ-15.4)
  - Operation type validation (REQ-15.3)
  - Justification minimum length (REQ-15.2)
  - Role validation for approvers
  - is_operation_approved check

Requirements: 15.1, 15.2, 15.3, 15.4
"""

import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from governance.approvals import (
    ApprovalRequest,
    ApprovalResponse,
    ApprovalStatus,
    OperationType,
    OPERATION_REQUIRED_APPROVERS,
    APPROVAL_EXPIRATION_HOURS,
    MIN_JUSTIFICATION_LENGTH,
    request_approval,
    approve_request,
    reject_request,
    check_expiration,
    get_pending_approvals,
    is_operation_approved,
    _load_approvals,
    _save_approvals,
    APPROVALS_DIR,
    APPROVALS_FILE,
)


class TestApprovalRequest:
    """Tests for ApprovalRequest dataclass validation."""

    def test_create_valid_request(self):
        """A valid approval request is created with all required fields."""
        req = ApprovalRequest(
            operation="PRODUCTION_MIGRATION",
            requester_id="admin-001",
            approver_role="VP_APPROVER",
            justification="Deploying Q1 release to production environment",
        )
        assert req.operation == "PRODUCTION_MIGRATION"
        assert req.requester_id == "admin-001"
        assert req.approver_role == "VP_APPROVER"
        assert req.status == ApprovalStatus.PENDING
        assert req.id is not None
        assert req.requested_at is not None
        assert req.expires_at is not None

    def test_expires_at_is_72_hours_after_requested(self):
        """expires_at is exactly 72 hours after requested_at."""
        req = ApprovalRequest(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Removing expired PII data per retention policy",
        )
        requested = datetime.fromisoformat(req.requested_at)
        expires = datetime.fromisoformat(req.expires_at)
        delta = expires - requested
        assert delta == timedelta(hours=72)

    def test_missing_operation_raises_error(self):
        """Empty operation raises ValueError."""
        with pytest.raises(ValueError, match="operation is required"):
            ApprovalRequest(
                operation="",
                requester_id="admin-001",
                approver_role="VP_APPROVER",
                justification="Valid justification here",
            )

    def test_missing_requester_id_raises_error(self):
        """Empty requester_id raises ValueError."""
        with pytest.raises(ValueError, match="requester_id is required"):
            ApprovalRequest(
                operation="RBAC_CHANGE",
                requester_id="",
                approver_role="LEGAL_APPROVER",
                justification="Valid justification here",
            )

    def test_invalid_approver_role_raises_error(self):
        """Invalid approver_role raises ValueError."""
        with pytest.raises(ValueError, match="approver_role must be"):
            ApprovalRequest(
                operation="RBAC_CHANGE",
                requester_id="admin-001",
                approver_role="ANALYST",
                justification="Valid justification here",
            )

    def test_short_justification_raises_error(self):
        """Justification shorter than 10 chars raises ValueError."""
        with pytest.raises(ValueError, match="justification must be at least"):
            ApprovalRequest(
                operation="DATA_DELETION",
                requester_id="admin-001",
                approver_role="LEGAL_APPROVER",
                justification="short",
            )

    def test_justification_exactly_10_chars(self):
        """Justification with exactly 10 chars is accepted."""
        req = ApprovalRequest(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="1234567890",
        )
        assert len(req.justification) == 10

    def test_is_expired_property_false_when_fresh(self):
        """is_expired returns False for a fresh approval."""
        req = ApprovalRequest(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Valid justification text",
        )
        assert req.is_expired is False

    def test_is_expired_property_true_when_past(self):
        """is_expired returns True when expires_at is in the past."""
        past_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        req = ApprovalRequest(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Valid justification text",
            requested_at=(datetime.now(timezone.utc) - timedelta(hours=80)).isoformat(),
            expires_at=past_time,
        )
        assert req.is_expired is True

    def test_to_dict_excludes_none_values(self):
        """to_dict() omits None values."""
        req = ApprovalRequest(
            operation="RBAC_CHANGE",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Valid justification text",
        )
        d = req.to_dict()
        assert "approved_by" not in d
        assert "approved_at" not in d
        assert "operation" in d
        assert "id" in d


class TestOperationTypes:
    """Tests for OperationType enum and operation-to-role mapping."""

    def test_all_operations_have_approvers(self):
        """Every OperationType has at least one required approver role."""
        for op in OperationType:
            assert op in OPERATION_REQUIRED_APPROVERS
            assert len(OPERATION_REQUIRED_APPROVERS[op]) >= 1

    def test_production_migration_requires_vp(self):
        """PRODUCTION_MIGRATION requires VP_APPROVER."""
        roles = OPERATION_REQUIRED_APPROVERS[OperationType.PRODUCTION_MIGRATION]
        assert "VP_APPROVER" in roles

    def test_rbac_change_requires_both(self):
        """RBAC_CHANGE requires both LEGAL_APPROVER and VP_APPROVER."""
        roles = OPERATION_REQUIRED_APPROVERS[OperationType.RBAC_CHANGE]
        assert "LEGAL_APPROVER" in roles
        assert "VP_APPROVER" in roles

    def test_data_deletion_requires_legal(self):
        """DATA_DELETION requires LEGAL_APPROVER."""
        roles = OPERATION_REQUIRED_APPROVERS[OperationType.DATA_DELETION]
        assert "LEGAL_APPROVER" in roles

    def test_security_config_requires_both(self):
        """SECURITY_CONFIG_CHANGE requires both approvers."""
        roles = OPERATION_REQUIRED_APPROVERS[OperationType.SECURITY_CONFIG_CHANGE]
        assert "LEGAL_APPROVER" in roles
        assert "VP_APPROVER" in roles


class TestRequestApproval:
    """Tests for the request_approval function."""

    @pytest.fixture(autouse=True)
    def _use_temp_storage(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """Use a temporary directory for approvals storage."""
        temp_dir = tmp_path / "governance"
        temp_file = temp_dir / "approvals.json"
        monkeypatch.setattr("governance.approvals.APPROVALS_DIR", temp_dir)
        monkeypatch.setattr("governance.approvals.APPROVALS_FILE", temp_file)
        # Mock audit logger to not require DB or file
        monkeypatch.setattr(
            "governance.approvals.log_audit_event",
            lambda **kwargs: None,
        )
        self.storage_dir = temp_dir
        self.storage_file = temp_file

    def test_valid_request_creation(self):
        """A valid request is created successfully."""
        resp = request_approval(
            operation="PRODUCTION_MIGRATION",
            requester_id="admin-001",
            approver_role="VP_APPROVER",
            justification="Deploying Q1 release to production environment",
        )
        assert resp.success is True
        assert resp.approval is not None
        assert resp.approval.status == ApprovalStatus.PENDING
        assert resp.approval.operation == "PRODUCTION_MIGRATION"

    def test_invalid_operation_returns_error(self):
        """An invalid operation type returns an error response."""
        resp = request_approval(
            operation="INVALID_OP",
            requester_id="admin-001",
            approver_role="VP_APPROVER",
            justification="This should fail due to invalid operation",
        )
        assert resp.success is False
        assert resp.error_code == "INVALID_OPERATION"

    def test_wrong_approver_for_operation_returns_error(self):
        """Requesting wrong approver role for an operation returns error."""
        # PRODUCTION_MIGRATION requires VP_APPROVER, not LEGAL_APPROVER
        resp = request_approval(
            operation="PRODUCTION_MIGRATION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="This should fail due to wrong approver role",
        )
        assert resp.success is False
        assert resp.error_code == "INVALID_APPROVER_ROLE"

    def test_short_justification_returns_error(self):
        """Justification < 10 chars returns a validation error."""
        resp = request_approval(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="short",
        )
        assert resp.success is False
        assert resp.error_code == "VALIDATION_ERROR"

    def test_request_persisted_to_storage(self):
        """Created request is persisted to file storage."""
        request_approval(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Removing expired PII data per retention policy",
        )
        approvals = _load_approvals()
        assert len(approvals) == 1
        assert approvals[0]["operation"] == "DATA_DELETION"

    def test_multiple_requests_accumulated(self):
        """Multiple requests are all stored."""
        request_approval(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="First deletion request for old records",
        )
        request_approval(
            operation="PRODUCTION_MIGRATION",
            requester_id="admin-002",
            approver_role="VP_APPROVER",
            justification="Second migration request for production",
        )
        approvals = _load_approvals()
        assert len(approvals) == 2


class TestApproveRequest:
    """Tests for the approve_request function."""

    @pytest.fixture(autouse=True)
    def _use_temp_storage(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """Use a temporary directory and seed a pending approval."""
        temp_dir = tmp_path / "governance"
        temp_file = temp_dir / "approvals.json"
        monkeypatch.setattr("governance.approvals.APPROVALS_DIR", temp_dir)
        monkeypatch.setattr("governance.approvals.APPROVALS_FILE", temp_file)
        monkeypatch.setattr(
            "governance.approvals.log_audit_event",
            lambda **kwargs: None,
        )
        self.storage_dir = temp_dir
        self.storage_file = temp_file

        # Create a pending approval
        resp = request_approval(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Removing expired PII data per retention policy",
        )
        self.approval_id = resp.approval.id

    def test_approve_with_correct_role(self):
        """Approval with correct role succeeds."""
        resp = approve_request(
            approval_id=self.approval_id,
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="Reviewed and confirmed compliance requirements met",
        )
        assert resp.success is True
        assert resp.approval.status == ApprovalStatus.APPROVED
        assert resp.approval.approved_by == "legal-001"

    def test_approve_with_wrong_role_fails(self):
        """Approval with wrong role returns role mismatch error."""
        resp = approve_request(
            approval_id=self.approval_id,
            approver_id="vp-001",
            approver_role="VP_APPROVER",
            justification="Trying to approve with wrong role for this step",
        )
        assert resp.success is False
        assert resp.error_code == "ROLE_MISMATCH"

    def test_approve_nonexistent_fails(self):
        """Approving a non-existent request returns not found."""
        resp = approve_request(
            approval_id="non-existent-id",
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="This should fail because approval does not exist",
        )
        assert resp.success is False
        assert resp.error_code == "NOT_FOUND"

    def test_approve_already_approved_fails(self):
        """Cannot approve an already-approved request."""
        # First approve
        approve_request(
            approval_id=self.approval_id,
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="First approval with valid justification text",
        )
        # Second approve attempt
        resp = approve_request(
            approval_id=self.approval_id,
            approver_id="legal-002",
            approver_role="LEGAL_APPROVER",
            justification="Trying to approve again should fail here",
        )
        assert resp.success is False
        assert resp.error_code == "INVALID_STATUS"

    def test_approve_short_justification_fails(self):
        """Approval with short justification returns validation error."""
        resp = approve_request(
            approval_id=self.approval_id,
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="short",
        )
        assert resp.success is False
        assert resp.error_code == "VALIDATION_ERROR"


class TestRejectRequest:
    """Tests for the reject_request function."""

    @pytest.fixture(autouse=True)
    def _use_temp_storage(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """Use a temporary directory and seed a pending approval."""
        temp_dir = tmp_path / "governance"
        temp_file = temp_dir / "approvals.json"
        monkeypatch.setattr("governance.approvals.APPROVALS_DIR", temp_dir)
        monkeypatch.setattr("governance.approvals.APPROVALS_FILE", temp_file)
        monkeypatch.setattr(
            "governance.approvals.log_audit_event",
            lambda **kwargs: None,
        )
        self.storage_dir = temp_dir
        self.storage_file = temp_file

        resp = request_approval(
            operation="SECURITY_CONFIG_CHANGE",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Updating security configuration for new requirements",
        )
        self.approval_id = resp.approval.id

    def test_reject_with_correct_role(self):
        """Rejection with correct role succeeds."""
        resp = reject_request(
            approval_id=self.approval_id,
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="Does not meet compliance requirements for this change",
        )
        assert resp.success is True
        assert resp.approval.status == ApprovalStatus.REJECTED

    def test_reject_with_wrong_role_fails(self):
        """Rejection with wrong role returns role mismatch error."""
        resp = reject_request(
            approval_id=self.approval_id,
            approver_id="vp-001",
            approver_role="VP_APPROVER",
            justification="Trying to reject with wrong role for this step",
        )
        assert resp.success is False
        assert resp.error_code == "ROLE_MISMATCH"

    def test_reject_short_justification_fails(self):
        """Rejection with short justification returns validation error."""
        resp = reject_request(
            approval_id=self.approval_id,
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="no",
        )
        assert resp.success is False
        assert resp.error_code == "VALIDATION_ERROR"


class TestExpirationLogic:
    """Tests for 72-hour expiration and auto-invalidation (REQ-15.4)."""

    @pytest.fixture(autouse=True)
    def _use_temp_storage(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """Use a temporary directory."""
        temp_dir = tmp_path / "governance"
        temp_file = temp_dir / "approvals.json"
        monkeypatch.setattr("governance.approvals.APPROVALS_DIR", temp_dir)
        monkeypatch.setattr("governance.approvals.APPROVALS_FILE", temp_file)
        monkeypatch.setattr(
            "governance.approvals.log_audit_event",
            lambda **kwargs: None,
        )
        self.storage_dir = temp_dir
        self.storage_file = temp_file

    def test_expired_approval_cannot_be_approved(self):
        """An expired approval cannot be approved (REQ-15.4)."""
        # Create an approval with past expiration
        past = datetime.now(timezone.utc) - timedelta(hours=80)
        expired_record = {
            "id": "expired-approval-001",
            "operation": "DATA_DELETION",
            "requester_id": "admin-001",
            "approver_role": "LEGAL_APPROVER",
            "justification": "Removing expired PII data per retention policy",
            "status": "pending",
            "requested_at": past.isoformat(),
            "expires_at": (past + timedelta(hours=72)).isoformat(),
        }
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        with open(self.storage_file, "w") as f:
            json.dump([expired_record], f)

        resp = approve_request(
            approval_id="expired-approval-001",
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="Trying to approve an expired request should fail",
        )
        assert resp.success is False
        assert resp.error_code == "EXPIRED"

    def test_check_expiration_marks_overdue_approvals(self):
        """check_expiration marks all overdue approvals as expired."""
        past = datetime.now(timezone.utc) - timedelta(hours=80)
        records = [
            {
                "id": "exp-1",
                "operation": "DATA_DELETION",
                "requester_id": "admin-001",
                "approver_role": "LEGAL_APPROVER",
                "justification": "Valid justification text here",
                "status": "pending",
                "requested_at": past.isoformat(),
                "expires_at": (past + timedelta(hours=72)).isoformat(),
            },
            {
                "id": "fresh-1",
                "operation": "RBAC_CHANGE",
                "requester_id": "admin-002",
                "approver_role": "LEGAL_APPROVER",
                "justification": "Valid justification text here",
                "status": "pending",
                "requested_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=72)).isoformat(),
            },
        ]
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        with open(self.storage_file, "w") as f:
            json.dump(records, f)

        expired_ids = check_expiration()
        assert "exp-1" in expired_ids
        assert "fresh-1" not in expired_ids

        # Verify storage was updated
        updated = _load_approvals()
        for record in updated:
            if record["id"] == "exp-1":
                assert record["status"] == "expired"
            elif record["id"] == "fresh-1":
                assert record["status"] == "pending"

    def test_fresh_approval_not_expired(self):
        """A fresh approval is not marked as expired."""
        resp = request_approval(
            operation="PRODUCTION_MIGRATION",
            requester_id="admin-001",
            approver_role="VP_APPROVER",
            justification="Deploying Q1 release to production environment",
        )
        expired_ids = check_expiration()
        assert resp.approval.id not in expired_ids


class TestIsOperationApproved:
    """Tests for the is_operation_approved check (REQ-15.1)."""

    @pytest.fixture(autouse=True)
    def _use_temp_storage(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """Use a temporary directory."""
        temp_dir = tmp_path / "governance"
        temp_file = temp_dir / "approvals.json"
        monkeypatch.setattr("governance.approvals.APPROVALS_DIR", temp_dir)
        monkeypatch.setattr("governance.approvals.APPROVALS_FILE", temp_file)
        monkeypatch.setattr(
            "governance.approvals.log_audit_event",
            lambda **kwargs: None,
        )
        self.storage_dir = temp_dir
        self.storage_file = temp_file

    def test_no_approval_returns_false(self):
        """No approval exists → operation is blocked."""
        assert is_operation_approved("PRODUCTION_MIGRATION") is False

    def test_pending_approval_returns_false(self):
        """A pending (not yet approved) approval doesn't unblock."""
        request_approval(
            operation="PRODUCTION_MIGRATION",
            requester_id="admin-001",
            approver_role="VP_APPROVER",
            justification="Deploying Q1 release to production environment",
        )
        assert is_operation_approved("PRODUCTION_MIGRATION") is False

    def test_approved_returns_true(self):
        """An approved, non-expired approval unblocks."""
        resp = request_approval(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Removing expired PII data per retention policy",
        )
        approve_request(
            approval_id=resp.approval.id,
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="Reviewed and confirmed compliance requirements met",
        )
        assert is_operation_approved("DATA_DELETION") is True

    def test_expired_approved_returns_false(self):
        """An approved approval that is past its expiration window returns False."""
        past = datetime.now(timezone.utc) - timedelta(hours=80)
        records = [
            {
                "id": "old-approved",
                "operation": "DATA_DELETION",
                "requester_id": "admin-001",
                "approver_role": "LEGAL_APPROVER",
                "justification": "Valid justification text here",
                "status": "approved",
                "requested_at": past.isoformat(),
                "expires_at": (past + timedelta(hours=72)).isoformat(),
                "approved_by": "legal-001",
                "approved_at": (past + timedelta(hours=1)).isoformat(),
            },
        ]
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        with open(self.storage_file, "w") as f:
            json.dump(records, f)

        assert is_operation_approved("DATA_DELETION") is False

    def test_filter_by_requester_id(self):
        """is_operation_approved can filter by requester_id."""
        resp = request_approval(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Removing expired PII data per retention policy",
        )
        approve_request(
            approval_id=resp.approval.id,
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="Reviewed and confirmed compliance requirements met",
        )
        assert is_operation_approved("DATA_DELETION", requester_id="admin-001") is True
        assert is_operation_approved("DATA_DELETION", requester_id="other-user") is False


class TestGetPendingApprovals:
    """Tests for the get_pending_approvals function."""

    @pytest.fixture(autouse=True)
    def _use_temp_storage(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        """Use a temporary directory."""
        temp_dir = tmp_path / "governance"
        temp_file = temp_dir / "approvals.json"
        monkeypatch.setattr("governance.approvals.APPROVALS_DIR", temp_dir)
        monkeypatch.setattr("governance.approvals.APPROVALS_FILE", temp_file)
        monkeypatch.setattr(
            "governance.approvals.log_audit_event",
            lambda **kwargs: None,
        )
        self.storage_dir = temp_dir
        self.storage_file = temp_file

    def test_empty_returns_empty_list(self):
        """No approvals returns empty list."""
        assert get_pending_approvals() == []

    def test_returns_only_pending(self):
        """Only pending approvals are returned."""
        resp = request_approval(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Removing expired PII data per retention policy",
        )
        approve_request(
            approval_id=resp.approval.id,
            approver_id="legal-001",
            approver_role="LEGAL_APPROVER",
            justification="Reviewed and confirmed compliance requirements met",
        )
        # Create another pending one
        request_approval(
            operation="PRODUCTION_MIGRATION",
            requester_id="admin-002",
            approver_role="VP_APPROVER",
            justification="Deploying Q2 release to production environment",
        )
        pending = get_pending_approvals()
        assert len(pending) == 1
        assert pending[0]["operation"] == "PRODUCTION_MIGRATION"

    def test_filter_by_approver_role(self):
        """Filter pending by approver_role."""
        request_approval(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Removing expired PII data per retention policy",
        )
        request_approval(
            operation="PRODUCTION_MIGRATION",
            requester_id="admin-002",
            approver_role="VP_APPROVER",
            justification="Deploying Q2 release to production environment",
        )
        legal_pending = get_pending_approvals(approver_role="LEGAL_APPROVER")
        assert len(legal_pending) == 1
        assert legal_pending[0]["approver_role"] == "LEGAL_APPROVER"

    def test_filter_by_operation(self):
        """Filter pending by operation type."""
        request_approval(
            operation="DATA_DELETION",
            requester_id="admin-001",
            approver_role="LEGAL_APPROVER",
            justification="Removing expired PII data per retention policy",
        )
        request_approval(
            operation="PRODUCTION_MIGRATION",
            requester_id="admin-002",
            approver_role="VP_APPROVER",
            justification="Deploying Q2 release to production environment",
        )
        deletion_pending = get_pending_approvals(operation="DATA_DELETION")
        assert len(deletion_pending) == 1
        assert deletion_pending[0]["operation"] == "DATA_DELETION"
