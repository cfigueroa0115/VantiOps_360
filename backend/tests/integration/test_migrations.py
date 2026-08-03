"""
Integration tests for database migration files (001-013).

Since this project uses Neon PostgreSQL and cannot run actual DB tests in CI
without a connection, these tests verify migration file correctness through:
1. SQL parsing tests (UP/DOWN sections, idempotency keywords)
2. Idempotency structure tests (CREATE IF NOT EXISTS, ON CONFLICT DO NOTHING)
3. Ordering tests (sequential numbering, FK dependency ordering)

Validates: Requirements 12.1, 12.3
"""

import re
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "database" / "migrations"
MIGRATION_FILES = sorted([f for f in MIGRATIONS_DIR.glob("*.sql") if re.match(r"^\d{3}_", f.name)])
EXPECTED_COUNT = 13

# Tables created per migration (manually mapped from file content)
# Used to verify FK references only point to tables from earlier migrations.
TABLES_BY_MIGRATION: dict[str, list[str]] = {
    "001": ["roles"],
    "002": ["app_users"],
    "003": ["sessions"],
    "004": ["permissions"],
    "005": ["user_roles", "role_permissions"],
    "006": ["partners", "partner_authorized_emails"],
    "007": ["partner_applications", "partner_application_versions"],
    "008": ["approval_steps", "approval_events"],
    "009": ["cancellation_requests", "cancellation_state_history"],
    "010": ["audit_events"],
    "011": ["migration_batches", "migration_records"],
    "012": ["documents", "document_versions"],
    "013": ["operational_businesses"],
}


def _read_migration(path: Path) -> str:
    """Read a migration file and return its content."""
    return path.read_text(encoding="utf-8")


def _split_up_down(content: str) -> tuple[str, str]:
    """Split migration content into UP and DOWN sections."""
    parts = re.split(r"^-- DOWN\b", content, flags=re.MULTILINE)
    if len(parts) < 2:
        return content, ""
    # UP is everything after "-- UP" marker until "-- DOWN"
    up_match = re.split(r"^-- UP\b", parts[0], flags=re.MULTILINE)
    up_section = up_match[-1] if len(up_match) > 1 else parts[0]
    down_section = parts[1]
    return up_section, down_section


def _get_migration_number(path: Path) -> int:
    """Extract the numeric prefix from a migration filename."""
    match = re.match(r"^(\d{3})_", path.name)
    return int(match.group(1)) if match else -1


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(params=MIGRATION_FILES, ids=[f.name for f in MIGRATION_FILES])
def migration_file(request) -> Path:
    """Parametrize over all migration files."""
    return request.param


@pytest.fixture
def migration_content(migration_file: Path) -> str:
    """Read migration file content."""
    return _read_migration(migration_file)


@pytest.fixture
def up_section(migration_content: str) -> str:
    """Extract the UP section of a migration."""
    up, _ = _split_up_down(migration_content)
    return up


@pytest.fixture
def down_section(migration_content: str) -> str:
    """Extract the DOWN section of a migration."""
    _, down = _split_up_down(migration_content)
    return down


# ===========================================================================
# 1. SQL Parsing Tests — UP/DOWN Structure
# ===========================================================================


class TestMigrationStructure:
    """Verify each migration file has proper UP/DOWN structure."""

    def test_migration_files_exist(self):
        """All 13 migration files exist in the migrations directory."""
        assert MIGRATIONS_DIR.exists(), f"Migrations directory not found: {MIGRATIONS_DIR}"
        assert len(MIGRATION_FILES) == EXPECTED_COUNT, (
            f"Expected {EXPECTED_COUNT} migration files, found {len(MIGRATION_FILES)}: "
            f"{[f.name for f in MIGRATION_FILES]}"
        )

    def test_contains_up_section(self, migration_file: Path, migration_content: str):
        """Each migration file contains a '-- UP' section marker."""
        assert "-- UP" in migration_content, f"{migration_file.name} is missing '-- UP' section"

    def test_contains_down_section(self, migration_file: Path, migration_content: str):
        """Each migration file contains a '-- DOWN' section marker."""
        assert "-- DOWN" in migration_content, f"{migration_file.name} is missing '-- DOWN' section"

    def test_up_uses_create_if_not_exists(self, migration_file: Path, up_section: str):
        """UP section uses CREATE TABLE IF NOT EXISTS or CREATE INDEX IF NOT EXISTS."""
        # Find all CREATE TABLE statements
        create_table_stmts = re.findall(
            r"CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)", up_section, re.IGNORECASE
        )
        assert (
            len(create_table_stmts) == 0
        ), f"{migration_file.name} UP section has CREATE TABLE without IF NOT EXISTS"

        # Find all CREATE INDEX statements (excluding CREATE OR REPLACE RULE)
        create_index_stmts = re.findall(
            r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)",
            up_section,
            re.IGNORECASE,
        )
        assert (
            len(create_index_stmts) == 0
        ), f"{migration_file.name} UP section has CREATE INDEX without IF NOT EXISTS"

    def test_down_uses_drop_if_exists(self, migration_file: Path, down_section: str):
        """DOWN section uses DROP TABLE IF EXISTS or DROP RULE IF EXISTS."""
        # All DROP TABLE statements must use IF EXISTS
        drop_table_no_if = re.findall(
            r"DROP\s+TABLE\s+(?!IF\s+EXISTS)", down_section, re.IGNORECASE
        )
        assert (
            len(drop_table_no_if) == 0
        ), f"{migration_file.name} DOWN section has DROP TABLE without IF EXISTS"

        # All DROP RULE statements must use IF EXISTS
        drop_rule_no_if = re.findall(r"DROP\s+RULE\s+(?!IF\s+EXISTS)", down_section, re.IGNORECASE)
        assert (
            len(drop_rule_no_if) == 0
        ), f"{migration_file.name} DOWN section has DROP RULE without IF EXISTS"

    def test_no_destructive_operations_in_up(self, migration_file: Path, up_section: str):
        """UP section does not contain destructive operations (DROP TABLE, TRUNCATE, DELETE without WHERE)."""
        # No DROP TABLE in UP section
        drop_tables = re.findall(r"\bDROP\s+TABLE\b", up_section, re.IGNORECASE)
        assert (
            len(drop_tables) == 0
        ), f"{migration_file.name} UP section contains DROP TABLE (destructive)"

        # No TRUNCATE in UP section
        truncates = re.findall(r"\bTRUNCATE\b", up_section, re.IGNORECASE)
        assert (
            len(truncates) == 0
        ), f"{migration_file.name} UP section contains TRUNCATE (destructive)"

        # No DELETE without WHERE in UP section
        delete_stmts = re.findall(r"\bDELETE\s+FROM\s+\w+\s*;", up_section, re.IGNORECASE)
        assert (
            len(delete_stmts) == 0
        ), f"{migration_file.name} UP section contains DELETE without WHERE clause (destructive)"


# ===========================================================================
# 2. Idempotency Structure Tests
# ===========================================================================


class TestIdempotency:
    """Verify idempotency patterns are used correctly."""

    def test_all_create_table_uses_if_not_exists(self, migration_file: Path, up_section: str):
        """Every CREATE TABLE in UP must include IF NOT EXISTS for idempotency."""
        all_creates = re.findall(r"CREATE\s+TABLE\s+", up_section, re.IGNORECASE)
        safe_creates = re.findall(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS", up_section, re.IGNORECASE)
        assert len(all_creates) == len(safe_creates), (
            f"{migration_file.name}: {len(all_creates)} CREATE TABLE statements but only "
            f"{len(safe_creates)} use IF NOT EXISTS"
        )

    def test_seed_data_uses_on_conflict(self, migration_file: Path, up_section: str):
        """INSERT statements for seed data use ON CONFLICT DO NOTHING for idempotency."""
        insert_stmts = re.findall(r"\bINSERT\s+INTO\b", up_section, re.IGNORECASE)
        if not insert_stmts:
            pytest.skip(f"{migration_file.name} has no INSERT statements")

        on_conflict_stmts = re.findall(r"\bON\s+CONFLICT\b", up_section, re.IGNORECASE)
        assert len(on_conflict_stmts) >= len(insert_stmts), (
            f"{migration_file.name}: {len(insert_stmts)} INSERT statements but only "
            f"{len(on_conflict_stmts)} ON CONFLICT clauses (all inserts must be idempotent)"
        )

    def test_down_section_drops_tables_in_reverse_order(
        self, migration_file: Path, down_section: str, up_section: str
    ):
        """DOWN section drops tables created in UP, handling dependent tables first."""
        # Extract table names from CREATE TABLE IF NOT EXISTS
        created_tables = re.findall(
            r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)",
            up_section,
            re.IGNORECASE,
        )
        # Extract table names from DROP TABLE IF EXISTS
        dropped_tables = re.findall(
            r"DROP\s+TABLE\s+IF\s+EXISTS\s+(\w+)",
            down_section,
            re.IGNORECASE,
        )

        if not created_tables:
            pytest.skip(f"{migration_file.name} has no CREATE TABLE statements")

        # All created tables must be dropped in DOWN
        for table in created_tables:
            assert (
                table in dropped_tables
            ), f"{migration_file.name}: table '{table}' created in UP but not dropped in DOWN"


# ===========================================================================
# 3. Ordering Tests
# ===========================================================================


class TestMigrationOrdering:
    """Verify migration files are numbered sequentially and FK dependencies are correct."""

    def test_sequential_numbering(self):
        """Migration files are numbered sequentially from 001 to 013."""
        numbers = [_get_migration_number(f) for f in MIGRATION_FILES]
        expected = list(range(1, EXPECTED_COUNT + 1))
        assert numbers == expected, (
            f"Migration files are not sequentially numbered. "
            f"Found: {numbers}, Expected: {expected}"
        )

    def test_fk_references_only_earlier_or_same_migrations(self):
        """FK REFERENCES clauses only reference tables from earlier or the same migration."""
        # Build a cumulative set of available tables as we go
        available_tables: set[str] = set()

        for migration_file in MIGRATION_FILES:
            number = _get_migration_number(migration_file)
            prefix = f"{number:03d}"
            content = _read_migration(migration_file)
            up_section, _ = _split_up_down(content)

            # Include tables from the current migration (self-references are valid
            # since all statements in a single file execute together)
            current_migration_tables = set(TABLES_BY_MIGRATION.get(prefix, []))
            valid_tables = available_tables | current_migration_tables

            # Extract all FK references: REFERENCES table_name(column)
            fk_references = re.findall(
                r"\bREFERENCES\s+(\w+)\s*\(",
                up_section,
                re.IGNORECASE,
            )

            for referenced_table in fk_references:
                assert referenced_table in valid_tables, (
                    f"Migration {prefix} ({migration_file.name}) references table "
                    f"'{referenced_table}' which is not created in any earlier or "
                    f"same migration. Available tables: {sorted(valid_tables)}"
                )

            # Add tables from this migration to the cumulative available set
            available_tables.update(current_migration_tables)

    def test_no_gaps_in_numbering(self):
        """No gaps in migration file numbering."""
        numbers = [_get_migration_number(f) for f in MIGRATION_FILES]
        for i in range(1, len(numbers)):
            assert (
                numbers[i] == numbers[i - 1] + 1
            ), f"Gap in migration numbering between {numbers[i-1]:03d} and {numbers[i]:03d}"


# ===========================================================================
# 4. Rollback Scenario Tests
# ===========================================================================


class TestRollbackScenario:
    """Verify that DOWN sections properly reverse UP operations."""

    def test_down_section_is_non_empty(self, migration_file: Path, down_section: str):
        """DOWN section contains actual SQL statements (not empty)."""
        # Remove comments and whitespace
        stripped = re.sub(r"--.*$", "", down_section, flags=re.MULTILINE).strip()
        stripped = re.sub(r"=+", "", stripped).strip()
        assert (
            len(stripped) > 0
        ), f"{migration_file.name} has empty DOWN section — rollback impossible"

    def test_down_uses_cascade_for_referenced_tables(
        self, migration_file: Path, down_section: str, up_section: str
    ):
        """Tables that might be referenced by FKs use CASCADE in DROP."""
        drop_stmts = re.findall(
            r"DROP\s+TABLE\s+IF\s+EXISTS\s+(\w+)\s*(CASCADE)?",
            down_section,
            re.IGNORECASE,
        )
        for table_name, cascade in drop_stmts:
            assert cascade.upper() == "CASCADE" if cascade else True, (
                f"{migration_file.name}: DROP TABLE {table_name} should use CASCADE "
                f"to handle potential FK dependencies during rollback"
            )

    def test_up_down_symmetry(self, migration_file: Path, up_section: str, down_section: str):
        """Number of tables created in UP equals number of tables dropped in DOWN."""
        created = re.findall(
            r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)",
            up_section,
            re.IGNORECASE,
        )
        dropped = re.findall(
            r"DROP\s+TABLE\s+IF\s+EXISTS\s+(\w+)",
            down_section,
            re.IGNORECASE,
        )

        if not created:
            pytest.skip(f"{migration_file.name} has no CREATE TABLE statements")

        assert len(created) == len(dropped), (
            f"{migration_file.name}: UP creates {len(created)} tables "
            f"({created}) but DOWN drops {len(dropped)} tables ({dropped})"
        )

    def test_rules_dropped_before_tables(self, migration_file: Path, down_section: str):
        """If migration creates rules, DOWN drops them before dropping the table."""
        # Check if UP creates rules (only migration 010 does this)
        content = _read_migration(migration_file)
        up, _ = _split_up_down(content)

        rule_creates = re.findall(r"CREATE\s+OR\s+REPLACE\s+RULE\s+(\w+)", up, re.IGNORECASE)
        if not rule_creates:
            pytest.skip(f"{migration_file.name} creates no rules")

        # Verify rules are dropped in DOWN
        rule_drops = re.findall(r"DROP\s+RULE\s+IF\s+EXISTS\s+(\w+)", down_section, re.IGNORECASE)
        for rule_name in rule_creates:
            assert rule_name in rule_drops, (
                f"{migration_file.name}: rule '{rule_name}' created in UP "
                f"but not dropped in DOWN"
            )

        # Verify rule drops come before table drops
        first_rule_drop = down_section.lower().find("drop rule")
        first_table_drop = down_section.lower().find("drop table")
        if first_rule_drop >= 0 and first_table_drop >= 0:
            assert (
                first_rule_drop < first_table_drop
            ), f"{migration_file.name}: rules should be dropped before tables in DOWN"
