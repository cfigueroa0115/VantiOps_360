"""
Audit logging module for VantiOps 360.

Provides append-only audit event logging per REQ-14.
"""

from audit.logger import AuditEvent, log_audit_event

__all__ = ["log_audit_event", "AuditEvent"]
