"""
Unit tests for the email validation module.

Tests cover:
  - RFC-5322 format validation
  - Corporate domain authorization (@vanti.com.co)
  - Whitelist loading and lookup (email + domain entries)
  - Per-entry expiration handling
  - Performance with 2,000 entries (REQ-17.4)
  - Denial reason reporting
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from auth.email_validator import (
    WhitelistCache,
    get_denial_reason,
    is_email_authorized,
    reload_whitelist,
    validate_email_format,
)

# ---------------------------------------------------------------------------
# Format validation tests
# ---------------------------------------------------------------------------


class TestValidateEmailFormat:
    """Tests for validate_email_format (RFC-5322 basic)."""

    def test_valid_corporate_email(self) -> None:
        assert validate_email_format("usuario@vanti.com.co") is True

    def test_valid_external_email(self) -> None:
        assert validate_email_format("user.name+tag@domain.com") is True

    def test_valid_simple_email(self) -> None:
        assert validate_email_format("a@b.co") is True

    def test_empty_string(self) -> None:
        assert validate_email_format("") is False

    def test_none_input(self) -> None:
        assert validate_email_format(None) is False  # type: ignore[arg-type]

    def test_no_at_sign(self) -> None:
        assert validate_email_format("invalid-email") is False

    def test_multiple_at_signs(self) -> None:
        assert validate_email_format("user@@domain.com") is False

    def test_whitespace_only(self) -> None:
        assert validate_email_format("   ") is False

    def test_exceeds_max_length(self) -> None:
        long_email = "a" * 250 + "@b.com"  # 256 chars, exceeds 254 limit
        assert validate_email_format(long_email) is False

    def test_with_leading_trailing_spaces(self) -> None:
        assert validate_email_format("  user@domain.com  ") is True


# ---------------------------------------------------------------------------
# Corporate domain tests
# ---------------------------------------------------------------------------


class TestCorporateDomainAuthorization:
    """Tests for corporate domain (@vanti.com.co) always-allowed logic."""

    def test_corporate_email_authorized(self) -> None:
        assert is_email_authorized("empleado@vanti.com.co") is True

    def test_corporate_email_case_insensitive(self) -> None:
        assert is_email_authorized("Empleado@Vanti.Com.Co") is True

    def test_corporate_email_with_subdomain_not_authorized(self) -> None:
        # sub.vanti.com.co is NOT the corporate domain
        assert is_email_authorized("user@sub.vanti.com.co") is False

    def test_non_corporate_without_whitelist(self, tmp_path: Path) -> None:
        # Empty whitelist file
        wl = tmp_path / "empty_whitelist.json"
        wl.write_text("[]")
        reload_whitelist(wl)
        assert is_email_authorized("hacker@evil.com", wl) is False


# ---------------------------------------------------------------------------
# Whitelist tests
# ---------------------------------------------------------------------------


class TestWhitelistCache:
    """Tests for WhitelistCache loading, lookup, and expiration."""

    def _create_whitelist(self, tmp_path: Path, entries: list) -> Path:
        wl = tmp_path / "email_whitelist.json"
        wl.write_text(json.dumps(entries))
        return wl

    def test_load_email_entry(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(
            tmp_path, [{"email": "partner@external.com", "expires_at": None}]
        )
        cache = WhitelistCache()
        cache.load(wl)
        assert cache.is_whitelisted("partner@external.com") is True

    def test_load_domain_entry(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(tmp_path, [{"domain": "@partner.com", "expires_at": None}])
        cache = WhitelistCache()
        cache.load(wl)
        assert cache.is_whitelisted("anyone@partner.com") is True

    def test_expired_email_denied(self, tmp_path: Path) -> None:
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        wl = self._create_whitelist(tmp_path, [{"email": "old@expired.com", "expires_at": past}])
        cache = WhitelistCache()
        cache.load(wl)
        assert cache.is_whitelisted("old@expired.com") is False

    def test_expired_domain_denied(self, tmp_path: Path) -> None:
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        wl = self._create_whitelist(tmp_path, [{"domain": "@oldpartner.com", "expires_at": past}])
        cache = WhitelistCache()
        cache.load(wl)
        assert cache.is_whitelisted("user@oldpartner.com") is False

    def test_future_expiration_allowed(self, tmp_path: Path) -> None:
        future = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        wl = self._create_whitelist(
            tmp_path, [{"email": "valid@partner.com", "expires_at": future}]
        )
        cache = WhitelistCache()
        cache.load(wl)
        assert cache.is_whitelisted("valid@partner.com") is True

    def test_null_expiration_never_expires(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(tmp_path, [{"domain": "@forever.com", "expires_at": None}])
        cache = WhitelistCache()
        cache.load(wl)
        assert cache.is_whitelisted("anyone@forever.com") is True

    def test_case_insensitive_lookup(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(tmp_path, [{"email": "User@Partner.COM", "expires_at": None}])
        cache = WhitelistCache()
        cache.load(wl)
        assert cache.is_whitelisted("user@partner.com") is True

    def test_missing_file_loads_empty(self, tmp_path: Path) -> None:
        missing = tmp_path / "nonexistent.json"
        cache = WhitelistCache()
        cache.load(missing)
        assert cache.email_count == 0

    def test_domain_without_at_prefix(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(tmp_path, [{"domain": "partner.com", "expires_at": None}])
        cache = WhitelistCache()
        cache.load(wl)
        assert cache.is_whitelisted("user@partner.com") is True


# ---------------------------------------------------------------------------
# Integration tests for is_email_authorized
# ---------------------------------------------------------------------------


class TestIsEmailAuthorized:
    """Integration tests for the main authorization function."""

    def _create_whitelist(self, tmp_path: Path, entries: list) -> Path:
        wl = tmp_path / "email_whitelist.json"
        wl.write_text(json.dumps(entries))
        return wl

    def test_corporate_always_passes(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(tmp_path, [])
        reload_whitelist(wl)
        assert is_email_authorized("any.user@vanti.com.co", wl) is True

    def test_whitelisted_email_passes(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(tmp_path, [{"email": "guest@allowed.com", "expires_at": None}])
        reload_whitelist(wl)
        assert is_email_authorized("guest@allowed.com", wl) is True

    def test_whitelisted_domain_passes(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(tmp_path, [{"domain": "@contractor.co", "expires_at": None}])
        reload_whitelist(wl)
        assert is_email_authorized("worker@contractor.co", wl) is True

    def test_invalid_format_denied(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(tmp_path, [])
        reload_whitelist(wl)
        assert is_email_authorized("not-an-email", wl) is False

    def test_unauthorized_email_denied(self, tmp_path: Path) -> None:
        wl = self._create_whitelist(tmp_path, [])
        reload_whitelist(wl)
        assert is_email_authorized("hacker@evil.org", wl) is False


# ---------------------------------------------------------------------------
# Performance test (REQ-17.4: 2,000 emails without degradation)
# ---------------------------------------------------------------------------


class TestPerformance:
    """Verify O(1) lookup performance with 2,000 entries."""

    def test_2000_emails_no_degradation(self, tmp_path: Path) -> None:
        """Load 2,000 email entries and verify lookup time stays under 1ms per check."""
        entries = [{"email": f"user{i}@company{i}.com", "expires_at": None} for i in range(2000)]
        wl = tmp_path / "big_whitelist.json"
        wl.write_text(json.dumps(entries))

        cache = WhitelistCache()
        cache.load(wl)
        assert cache.email_count == 2000

        # Time 1000 lookups
        start = time.perf_counter()
        for i in range(1000):
            cache.is_whitelisted(f"user{i}@company{i}.com")
        elapsed = time.perf_counter() - start

        # 1000 lookups should complete in well under 1 second
        assert elapsed < 1.0, f"1000 lookups took {elapsed:.3f}s, expected < 1.0s"

    def test_2000_domain_entries(self, tmp_path: Path) -> None:
        """Load 2,000 domain entries and verify lookup time stays under 1ms per check."""
        entries = [{"domain": f"@domain{i}.com", "expires_at": None} for i in range(2000)]
        wl = tmp_path / "big_domain_whitelist.json"
        wl.write_text(json.dumps(entries))

        cache = WhitelistCache()
        cache.load(wl)
        assert cache.email_count == 2000

        start = time.perf_counter()
        for i in range(1000):
            cache.is_whitelisted(f"user@domain{i}.com")
        elapsed = time.perf_counter() - start

        assert elapsed < 1.0, f"1000 domain lookups took {elapsed:.3f}s, expected < 1.0s"


# ---------------------------------------------------------------------------
# Denial reason tests
# ---------------------------------------------------------------------------


class TestGetDenialReason:
    """Tests for get_denial_reason function."""

    def test_invalid_format_reason(self) -> None:
        assert get_denial_reason("not-email") == "INVALID_EMAIL_FORMAT"

    def test_not_in_list_reason(self, tmp_path: Path) -> None:
        wl = tmp_path / "email_whitelist.json"
        wl.write_text("[]")
        reload_whitelist(wl)
        reason = get_denial_reason("stranger@unknown.com")
        assert reason == "EMAIL_NOT_IN_AUTHORIZED_LIST"

    def test_expired_email_reason(self, tmp_path: Path) -> None:
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        wl = tmp_path / "email_whitelist.json"
        wl.write_text(json.dumps([{"email": "old@partner.com", "expires_at": past}]))
        reload_whitelist(wl)
        reason = get_denial_reason("old@partner.com")
        assert reason == "WHITELIST_ENTRY_EXPIRED"

    def test_expired_domain_reason(self, tmp_path: Path) -> None:
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        wl = tmp_path / "email_whitelist.json"
        wl.write_text(json.dumps([{"domain": "@oldco.com", "expires_at": past}]))
        reload_whitelist(wl)
        reason = get_denial_reason("user@oldco.com")
        assert reason == "WHITELIST_DOMAIN_EXPIRED"
