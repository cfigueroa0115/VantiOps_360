"""
Email Validation Module for VantiOps 360.

Validates that user emails belong to the authorized corporate domain (@vanti.com.co)
or are present in the configurable whitelist (data/config/email_whitelist.json).

Requirements:
  - REQ-17.1: Validate email belongs to corporate domain or explicitly allowed domains.
  - REQ-17.2: Deny unauthorized emails with 403 and audit event.
  - REQ-17.3: Maintain whitelist with per-entry expiration dates.
  - REQ-17.4: Handle 2,000 emails without performance degradation.
  - REQ-22.1: Manage directory of up to 2,000 email addresses.

Performance:
  Uses set/dict for O(1) lookups to handle 2,000+ emails efficiently.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CORPORATE_DOMAIN = "@vanti.com.co"

# RFC-5322 simplified regex for basic email format validation
_EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9]"
    r"(?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
)

# Default whitelist path relative to project root
_DEFAULT_WHITELIST_PATH = Path(__file__).resolve().parents[3] / "data" / "config" / "email_whitelist.json"


# ---------------------------------------------------------------------------
# Whitelist Cache (O(1) lookup structures)
# ---------------------------------------------------------------------------


class WhitelistCache:
    """In-memory cache for the email whitelist, optimized for O(1) lookups.

    Stores authorized emails in a dict mapping email -> expiration datetime (or None).
    Stores authorized domains in a dict mapping domain -> expiration datetime (or None).
    """

    def __init__(self) -> None:
        self._emails: dict[str, datetime | None] = {}
        self._domains: dict[str, datetime | None] = {}

    def load(self, whitelist_path: Path | None = None) -> None:
        """Load whitelist from JSON file into memory structures.

        Args:
            whitelist_path: Path to the whitelist JSON file. Uses default if None.
        """
        path = whitelist_path or _DEFAULT_WHITELIST_PATH
        self._emails.clear()
        self._domains.clear()

        if not path.exists():
            return

        with open(path, "r", encoding="utf-8") as f:
            entries: list[dict[str, Any]] = json.load(f)

        for entry in entries:
            expires_at = _parse_expiration(entry.get("expires_at"))

            if "email" in entry:
                email = entry["email"].strip().lower()
                self._emails[email] = expires_at
            elif "domain" in entry:
                domain = entry["domain"].strip().lower()
                if not domain.startswith("@"):
                    domain = f"@{domain}"
                self._domains[domain] = expires_at

    def is_whitelisted(self, email: str) -> bool:
        """Check if an email is authorized via the whitelist (not expired).

        Args:
            email: The email to check (case-insensitive).

        Returns:
            True if the email or its domain is in the whitelist and not expired.
        """
        email_lower = email.strip().lower()
        now = datetime.now(timezone.utc)

        # Check exact email match
        if email_lower in self._emails:
            expires = self._emails[email_lower]
            if expires is None or expires > now:
                return True
            # Expired entry — treat as unauthorized
            return False

        # Check domain match
        at_idx = email_lower.rfind("@")
        if at_idx >= 0:
            domain = email_lower[at_idx:]
            if domain in self._domains:
                expires = self._domains[domain]
                if expires is None or expires > now:
                    return True
                return False

        return False

    @property
    def email_count(self) -> int:
        """Total number of entries (emails + domains) in the whitelist."""
        return len(self._emails) + len(self._domains)


# Module-level singleton cache
_cache = WhitelistCache()


def _parse_expiration(value: str | None) -> datetime | None:
    """Parse an ISO-8601 expiration timestamp.

    Args:
        value: ISO-8601 string or None for no expiration.

    Returns:
        A timezone-aware datetime or None if the entry never expires.
    """
    if value is None:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_email_format(email: str) -> bool:
    """Validate email format against RFC-5322 basic rules.

    Args:
        email: The email string to validate.

    Returns:
        True if the email has a valid format, False otherwise.

    Examples:
        >>> validate_email_format("user@vanti.com.co")
        True
        >>> validate_email_format("invalid-email")
        False
        >>> validate_email_format("")
        False
        >>> validate_email_format("user@domain")
        True
    """
    if not email or not isinstance(email, str):
        return False
    email = email.strip()
    if len(email) > 254:  # RFC-5321 max length
        return False
    return _EMAIL_REGEX.match(email) is not None


def is_email_authorized(email: str, whitelist_path: Path | None = None) -> bool:
    """Check if an email is authorized (corporate domain or whitelist).

    Implements REQ-17.1: validates email belongs to @vanti.com.co or is
    explicitly allowed in the whitelist configuration.

    Performance: Uses O(1) set/dict lookups to handle 2,000+ emails
    without degradation (REQ-17.4, REQ-22.1).

    Args:
        email: The email address to authorize.
        whitelist_path: Optional path to whitelist JSON. Uses default if None.

    Returns:
        True if authorized, False otherwise.

    Examples:
        >>> is_email_authorized("empleado@vanti.com.co")
        True
        >>> is_email_authorized("hacker@malicious.com")
        False
    """
    if not validate_email_format(email):
        return False

    email_lower = email.strip().lower()

    # Check corporate domain first (always authorized)
    if email_lower.endswith(CORPORATE_DOMAIN):
        return True

    # Ensure whitelist is loaded
    if _cache.email_count == 0:
        _cache.load(whitelist_path)

    return _cache.is_whitelisted(email_lower)


def reload_whitelist(whitelist_path: Path | None = None) -> int:
    """Reload the whitelist from disk.

    Call this when the whitelist file is updated to refresh the in-memory cache.

    Args:
        whitelist_path: Optional path to whitelist JSON.

    Returns:
        Number of entries loaded.
    """
    _cache.load(whitelist_path)
    return _cache.email_count


def get_denial_reason(email: str) -> str:
    """Get the reason why an email was denied authorization.

    Args:
        email: The email that was denied.

    Returns:
        A string describing the denial reason from a predefined set.
    """
    if not validate_email_format(email):
        return "INVALID_EMAIL_FORMAT"

    email_lower = email.strip().lower()

    if email_lower.endswith(CORPORATE_DOMAIN):
        # Corporate domain emails are always allowed — shouldn't reach here
        return "UNKNOWN"

    # Check if it was in whitelist but expired
    if email_lower in _cache._emails:
        expires = _cache._emails[email_lower]
        if expires is not None and expires <= datetime.now(timezone.utc):
            return "WHITELIST_ENTRY_EXPIRED"

    at_idx = email_lower.rfind("@")
    if at_idx >= 0:
        domain = email_lower[at_idx:]
        if domain in _cache._domains:
            expires = _cache._domains[domain]
            if expires is not None and expires <= datetime.now(timezone.utc):
                return "WHITELIST_DOMAIN_EXPIRED"

    return "EMAIL_NOT_IN_AUTHORIZED_LIST"
