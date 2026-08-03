"""Communications module for VantiOps 360.

Provides email directory management, bulk operations, throttled sending,
and audit logging for up to 2,000 email addresses.

Requirements:
  - REQ-22.1: Manage directory of up to 2,000 email addresses.
  - REQ-22.2: Bulk operations requiring SYSTEM_ADMIN confirmation.
  - REQ-22.3: Throttled sending (max 100 emails/minute).
  - REQ-22.4: Log all communications to audit_events.
"""

from communications.email_mgr import (  # noqa: F401
    MAX_DIRECTORY_SIZE,
    MAX_EMAILS_PER_MINUTE,
    EmailDirectory,
    EmailEntry,
    EmailStatus,
    ThrottledSender,
)
