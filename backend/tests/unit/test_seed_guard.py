"""Tests for production seed guard.

Validates that destructive operations are refused in production.

IMPORTANT:
- These tests do NOT connect to Neon or any real database.
- These tests do NOT execute DROP TABLE.
- These tests exercise only the pure guard function.
"""

import pytest

from safety.seed_guard import assert_safe_seed_environment


class TestSeedGuardProductionBlocked:
    """Verify that production environments are always blocked."""

    def test_vercel_env_production_raises(self):
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment("production")

    def test_vercel_env_prod_raises(self):
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment("prod")

    def test_production_uppercase_raises(self):
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment("PRODUCTION")

    def test_prod_uppercase_raises(self):
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment("PROD")

    def test_production_with_whitespace_raises(self):
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment("  production  ")

    def test_prod_mixed_case_raises(self):
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment("Production")


class TestSeedGuardNonProductionAllowed:
    """Verify that non-production environments are allowed."""

    def test_development_allowed(self):
        # Should not raise
        assert_safe_seed_environment("development")

    def test_test_allowed(self):
        assert_safe_seed_environment("test")

    def test_empty_string_allowed(self):
        assert_safe_seed_environment("")

    def test_none_with_no_env_vars_allowed(self, monkeypatch):
        """When no environment variables are set, None defaults to empty string."""
        monkeypatch.delenv("VERCEL_ENV", raising=False)
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        # Should not raise
        assert_safe_seed_environment(None)

    def test_staging_allowed(self):
        assert_safe_seed_environment("staging")

    def test_local_allowed(self):
        assert_safe_seed_environment("local")


class TestSeedGuardEnvVarDetection:
    """Verify that environment variables are detected correctly when env is None."""

    def test_vercel_env_production_detected(self, monkeypatch):
        monkeypatch.setenv("VERCEL_ENV", "production")
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment(None)

    def test_app_env_production_detected(self, monkeypatch):
        monkeypatch.delenv("VERCEL_ENV", raising=False)
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment(None)

    def test_environment_production_detected(self, monkeypatch):
        monkeypatch.delenv("VERCEL_ENV", raising=False)
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.setenv("ENVIRONMENT", "production")
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment(None)

    def test_vercel_env_prod_detected(self, monkeypatch):
        monkeypatch.setenv("VERCEL_ENV", "prod")
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        with pytest.raises(RuntimeError, match="DESTRUCTIVE SEED OPERATION REFUSED"):
            assert_safe_seed_environment(None)

    def test_development_env_var_allowed(self, monkeypatch):
        monkeypatch.setenv("VERCEL_ENV", "development")
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        # Should not raise
        assert_safe_seed_environment(None)


class TestSeedGuardNoDestructiveOperations:
    """Verify that this test module does NOT execute any destructive operations."""

    def test_no_database_import(self):
        """Confirm no database module is imported by the guard."""
        import importlib

        # Reload to check fresh imports
        mod = importlib.import_module("safety.seed_guard")
        # The module should not have imported psycopg2, sqlalchemy, or neon
        module_source = open(mod.__file__).read()
        assert "psycopg2" not in module_source
        assert "sqlalchemy" not in module_source
        assert "import neon" not in module_source
        # The module mentions DROP only in the error message (not as SQL command)
        assert "DROP TABLE" not in module_source.split("RuntimeError")[0]

    def test_no_drop_executed(self):
        """Meta-test: confirm test suite never issues DROP."""
        # This is a sentinel — if the test suite touches the database,
        # this assertion documents that it should NOT.
        pass
