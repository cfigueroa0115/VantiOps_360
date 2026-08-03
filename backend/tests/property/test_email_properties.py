"""
Property-based tests for unauthorized email denial with audit (Property 12).

**Validates: Requirements 17.2**

Uses Hypothesis to verify:
- P12a: Any email ending in @vanti.com.co is always authorized
- P12b: Any email NOT ending in @vanti.com.co and NOT in whitelist is always denied
- P12c: Expired whitelist entries are treated as unauthorized
- P12d: The denial reason is always one of the predefined set
"""

from __future__ import annotations

import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import hypothesis.strategies as st
from hypothesis import assume, given, settings

from auth.email_validator import (
    CORPORATE_DOMAIN,
    get_denial_reason,
    is_email_authorized,
    reload_whitelist,
    validate_email_format,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Predefined denial reasons from the email_validator module
VALID_DENIAL_REASONS = frozenset(
    {
        "INVALID_EMAIL_FORMAT",
        "EMAIL_NOT_IN_AUTHORIZED_LIST",
        "WHITELIST_ENTRY_EXPIRED",
        "WHITELIST_DOMAIN_EXPIRED",
        "UNKNOWN",
    }
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Valid email local parts (RFC-5322 simplified: alphanumeric + allowed specials)
_local_part_chars = st.sampled_from(
    "abcdefghijklmnopqrstuvwxyz" "ABCDEFGHIJKLMNOPQRSTUVWXYZ" "0123456789" ".!#$%&'*+/=?^_`{|}~-"
)

email_local_parts = st.text(
    alphabet=_local_part_chars,
    min_size=1,
    max_size=30,
).filter(
    # Local part cannot start/end with a dot and cannot have consecutive dots
    lambda s: not s.startswith(".") and not s.endswith(".") and ".." not in s
)

# Non-corporate domains (never @vanti.com.co)
non_corporate_domain_parts = st.text(
    alphabet=st.sampled_from("abcdefghijklmnopqrstuvwxyz0123456789-"),
    min_size=1,
    max_size=20,
).filter(lambda s: not s.startswith("-") and not s.endswith("-"))

non_corporate_tlds = st.sampled_from(
    [
        "com",
        "org",
        "net",
        "io",
        "co",
        "edu",
        "gov",
        "xyz",
        "info",
        "com.mx",
        "co.uk",
        "org.co",
        "com.ar",
    ]
)


@st.composite
def non_corporate_domains(draw: st.DrawFn) -> str:
    """Generate domain strings that are NOT @vanti.com.co."""
    part = draw(non_corporate_domain_parts)
    tld = draw(non_corporate_tlds)
    domain = f"@{part}.{tld}"
    # Ensure it's never the corporate domain
    assume(domain.lower() != CORPORATE_DOMAIN)
    return domain


@st.composite
def corporate_emails(draw: st.DrawFn) -> str:
    """Generate valid emails with @vanti.com.co domain."""
    local = draw(email_local_parts)
    return f"{local}{CORPORATE_DOMAIN}"


@st.composite
def non_corporate_emails(draw: st.DrawFn) -> str:
    """Generate valid emails with a non-corporate domain."""
    local = draw(email_local_parts)
    domain = draw(non_corporate_domains())
    return f"{local}{domain}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_whitelist_file(entries: list[dict]) -> Path:
    """Create a temporary whitelist JSON file with the given entries."""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8")
    json.dump(entries, tmp)
    tmp.flush()
    tmp.close()
    return Path(tmp.name)


def _create_empty_whitelist() -> Path:
    """Create a temporary empty whitelist JSON file."""
    return _create_whitelist_file([])


# ---------------------------------------------------------------------------
# Property Tests
# ---------------------------------------------------------------------------


class TestCorporateEmailAlwaysAuthorized:
    """P12a: Any email ending in @vanti.com.co is always authorized."""

    @given(email=corporate_emails())
    @settings(max_examples=200)
    def test_corporate_domain_always_authorized(self, email: str):
        """Any email with the corporate domain @vanti.com.co is always authorized."""
        # Use an empty whitelist to ensure authorization comes purely from domain
        whitelist_path = _create_empty_whitelist()
        try:
            # Force reload with empty whitelist
            reload_whitelist(whitelist_path)

            # Verify the email is valid format first
            assume(validate_email_format(email))

            result = is_email_authorized(email, whitelist_path)

            assert (
                result is True
            ), f"Corporate email '{email}' was denied but should ALWAYS be authorized"
        finally:
            whitelist_path.unlink(missing_ok=True)


class TestNonCorporateEmailAlwaysDenied:
    """P12b: Any email NOT ending in @vanti.com.co and NOT in whitelist is always denied."""

    @given(email=non_corporate_emails())
    @settings(max_examples=200)
    def test_non_corporate_non_whitelisted_always_denied(self, email: str):
        """Non-corporate emails not in whitelist are always denied."""
        # Use an empty whitelist
        whitelist_path = _create_empty_whitelist()
        try:
            reload_whitelist(whitelist_path)

            # Verify the email is valid format
            assume(validate_email_format(email))

            result = is_email_authorized(email, whitelist_path)

            assert result is False, (
                f"Non-corporate email '{email}' was authorized but should be DENIED "
                f"(not in whitelist, domain is not {CORPORATE_DOMAIN})"
            )
        finally:
            whitelist_path.unlink(missing_ok=True)


class TestExpiredWhitelistTreatedAsUnauthorized:
    """P12c: Expired whitelist entries are treated as unauthorized."""

    @given(email=non_corporate_emails())
    @settings(max_examples=100)
    def test_expired_email_entry_denied(self, email: str):
        """An email in the whitelist with an expired date is treated as unauthorized."""
        assume(validate_email_format(email))

        # Create a whitelist with this email but expired yesterday
        expired_time = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        entries = [{"email": email.lower(), "expires_at": expired_time}]
        whitelist_path = _create_whitelist_file(entries)
        try:
            reload_whitelist(whitelist_path)

            result = is_email_authorized(email, whitelist_path)

            assert (
                result is False
            ), f"Email '{email}' with expired whitelist entry was authorized but should be DENIED"
        finally:
            whitelist_path.unlink(missing_ok=True)

    @given(local_part=email_local_parts, domain=non_corporate_domains())
    @settings(max_examples=100)
    def test_expired_domain_entry_denied(self, local_part: str, domain: str):
        """A domain in the whitelist with an expired date treats all its emails as unauthorized."""
        email = f"{local_part}{domain}"
        assume(validate_email_format(email))

        # Create a whitelist with the domain but expired yesterday
        expired_time = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        # Remove @ prefix for the whitelist entry (module adds it)
        domain_value = domain.lstrip("@")
        entries = [{"domain": domain_value, "expires_at": expired_time}]
        whitelist_path = _create_whitelist_file(entries)
        try:
            reload_whitelist(whitelist_path)

            result = is_email_authorized(email, whitelist_path)

            assert result is False, (
                f"Email '{email}' with expired domain whitelist entry was authorized "
                f"but should be DENIED"
            )
        finally:
            whitelist_path.unlink(missing_ok=True)


class TestDenialReasonAlwaysPredefined:
    """P12d: The denial reason is always one of the predefined set."""

    @given(email=non_corporate_emails())
    @settings(max_examples=200)
    def test_denial_reason_from_predefined_set(self, email: str):
        """For any denied email, the reason is always from the predefined set."""
        assume(validate_email_format(email))

        # Use empty whitelist so email is denied
        whitelist_path = _create_empty_whitelist()
        try:
            reload_whitelist(whitelist_path)

            # Verify the email is indeed denied
            authorized = is_email_authorized(email, whitelist_path)
            assume(not authorized)

            reason = get_denial_reason(email)

            assert reason in VALID_DENIAL_REASONS, (
                f"Denial reason '{reason}' for email '{email}' is NOT in the predefined set: "
                f"{VALID_DENIAL_REASONS}"
            )
        finally:
            whitelist_path.unlink(missing_ok=True)

    @given(email=st.text(min_size=0, max_size=50))
    @settings(max_examples=100)
    def test_invalid_format_denial_reason_predefined(self, email: str):
        """Even for invalid format emails, the denial reason is from the predefined set."""
        assume(not validate_email_format(email))

        reason = get_denial_reason(email)

        assert reason in VALID_DENIAL_REASONS, (
            f"Denial reason '{reason}' for invalid email '{email}' is NOT in the predefined set: "
            f"{VALID_DENIAL_REASONS}"
        )

    @given(email=non_corporate_emails())
    @settings(max_examples=100)
    def test_expired_entry_denial_reason_predefined(self, email: str):
        """For expired whitelist entries, the denial reason is from the predefined set."""
        assume(validate_email_format(email))

        # Create expired whitelist entry
        expired_time = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        entries = [{"email": email.lower(), "expires_at": expired_time}]
        whitelist_path = _create_whitelist_file(entries)
        try:
            reload_whitelist(whitelist_path)

            reason = get_denial_reason(email)

            assert reason in VALID_DENIAL_REASONS, (
                f"Denial reason '{reason}' for expired email '{email}' is NOT in "
                f"the predefined set: {VALID_DENIAL_REASONS}"
            )
        finally:
            whitelist_path.unlink(missing_ok=True)
