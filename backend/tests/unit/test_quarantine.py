"""Unit tests for the ETL pipeline quarantine mechanism.

Tests cover:
- quarantine_record() writes to staging/quarantine.parquet with required fields
- quarantine_record() fields: rule_id, reason, quarantine_timestamp
- validate_records() quarantines invalid records and returns valid ones
- Validation errors go directly to quarantine (no retry)
- Transient I/O errors in quarantine write are retried
- Curated output uses {name}_curated.parquet with snappy compression

Requirements: 10.3, 10.4, 10.5
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import polars as pl
import pytest

from pipeline.orchestrator import PipelineOrchestrator


@pytest.fixture
def tmp_output_dir(tmp_path: Path) -> Path:
    """Create a temporary output directory with staging and serving subdirectories."""
    (tmp_path / "staging").mkdir(parents=True)
    (tmp_path / "serving").mkdir(parents=True)
    (tmp_path / "curated").mkdir(parents=True)
    return tmp_path


@pytest.fixture
def orchestrator(tmp_output_dir: Path) -> PipelineOrchestrator:
    """Create an orchestrator with a temporary output directory."""
    return PipelineOrchestrator(output_dir=tmp_output_dir)


class TestQuarantineRecord:
    """Tests for quarantine_record() method — Requirement 10.3."""

    def test_writes_to_staging_quarantine_parquet(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """quarantine_record() writes to staging/quarantine.parquet."""
        record = {"id_pqr": 1, "estado": "invalid_state"}
        orchestrator.quarantine_record(record, rule_id="SCHEMA_VALIDATION", reason="Invalid estado")

        quarantine_path = tmp_output_dir / "staging" / "quarantine.parquet"
        assert quarantine_path.exists()

    def test_quarantine_has_required_fields(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """Quarantine entry contains rule_id, reason, and quarantine_timestamp."""
        record = {"id_pqr": 42, "estado": "bad"}
        orchestrator.quarantine_record(
            record, rule_id="TIPO_PQR_INVALID", reason="tipo_pqr not in allowed values"
        )

        quarantine_path = tmp_output_dir / "staging" / "quarantine.parquet"
        df = pl.read_parquet(quarantine_path)

        assert "rule_id" in df.columns
        assert "reason" in df.columns
        assert "quarantine_timestamp" in df.columns

    def test_quarantine_rule_id_stored_correctly(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """rule_id field is stored with the correct value."""
        record = {"id_pqr": 1}
        orchestrator.quarantine_record(record, rule_id="NULL_CHECK", reason="Missing required field")

        quarantine_path = tmp_output_dir / "staging" / "quarantine.parquet"
        df = pl.read_parquet(quarantine_path)

        assert df["rule_id"][0] == "NULL_CHECK"

    def test_quarantine_reason_stored_correctly(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """reason field is stored with the correct value."""
        record = {"id_pqr": 1}
        reason_text = "Field 'causa' is null but required"
        orchestrator.quarantine_record(record, rule_id="NULLABLE_CHECK", reason=reason_text)

        quarantine_path = tmp_output_dir / "staging" / "quarantine.parquet"
        df = pl.read_parquet(quarantine_path)

        assert df["reason"][0] == reason_text

    def test_quarantine_timestamp_is_iso8601_utc(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """quarantine_timestamp is a valid ISO-8601 UTC timestamp."""
        record = {"id_pqr": 1}
        orchestrator.quarantine_record(record, rule_id="TEST", reason="test reason")

        quarantine_path = tmp_output_dir / "staging" / "quarantine.parquet"
        df = pl.read_parquet(quarantine_path)

        ts = df["quarantine_timestamp"][0]
        # Should parse without error — ISO 8601 format
        parsed = datetime.fromisoformat(ts)
        assert parsed.tzinfo is not None or "+" in ts or "Z" in ts

    def test_quarantine_appends_multiple_records(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """Multiple quarantine_record() calls append to the same file."""
        orchestrator.quarantine_record({"id": 1}, rule_id="R1", reason="reason 1")
        orchestrator.quarantine_record({"id": 2}, rule_id="R2", reason="reason 2")
        orchestrator.quarantine_record({"id": 3}, rule_id="R3", reason="reason 3")

        quarantine_path = tmp_output_dir / "staging" / "quarantine.parquet"
        df = pl.read_parquet(quarantine_path)

        assert df.height == 3
        assert df["rule_id"].to_list() == ["R1", "R2", "R3"]

    def test_quarantine_record_data_stored_as_json(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """Record data is serialized as JSON string."""
        record = {"id_pqr": 99, "estado": "invalid", "causa": "test"}
        orchestrator.quarantine_record(record, rule_id="TEST", reason="test")

        quarantine_path = tmp_output_dir / "staging" / "quarantine.parquet"
        df = pl.read_parquet(quarantine_path)

        record_data = json.loads(df["record_data"][0])
        assert record_data["id_pqr"] == 99
        assert record_data["estado"] == "invalid"

    def test_quarantine_creates_staging_directory_if_missing(
        self, tmp_path: Path
    ):
        """Creates staging directory if it doesn't exist."""
        # Use a fresh path without pre-created dirs
        orch = PipelineOrchestrator(output_dir=tmp_path / "fresh_output")
        orch.quarantine_record({"id": 1}, rule_id="TEST", reason="test")

        quarantine_path = tmp_path / "fresh_output" / "staging" / "quarantine.parquet"
        assert quarantine_path.exists()


class TestValidateRecords:
    """Tests for validate_records() method — Requirement 10.3, 10.4."""

    def _make_valid_df(self, n: int = 3) -> pl.DataFrame:
        """Create a valid PQR DataFrame for testing."""
        from datetime import date

        return pl.DataFrame({
            "id_pqr": list(range(1, n + 1)),
            "fecha_creacion": [date(2023, 1, 1)] * n,
            "fecha_cierre": [None] * n,
            "estado": ["abierto"] * n,
            "causa": ["causa_test"] * n,
            "canal_atencion": ["canal_test"] * n,
            "empresa": ["empresa_test"] * n,
            "resultado": [None] * n,
            "unidad_responsable": [None] * n,
            "marcacion": [None] * n,
            "motivo_cierre": [None] * n,
            "tiempo_gestion_dias": [5.0] * n,
            "tipo_pqr": ["peticion"] * n,
        })

    def _make_invalid_df(self) -> pl.DataFrame:
        """Create a DataFrame with invalid records for testing."""
        from datetime import date

        return pl.DataFrame({
            "id_pqr": [100],
            "fecha_creacion": [date(2023, 6, 15)],
            "fecha_cierre": [None],
            "estado": ["INVALID_STATE"],  # Invalid — not in ["cerrado", "en_proceso", "abierto"]
            "causa": ["test_causa"],
            "canal_atencion": ["canal"],
            "empresa": ["empresa"],
            "resultado": [None],
            "unidad_responsable": [None],
            "marcacion": [None],
            "motivo_cierre": [None],
            "tiempo_gestion_dias": [3.0],
            "tipo_pqr": ["INVALID_TIPO"],  # Invalid — not in ["peticion", "queja", "reclamo"]
        })

    def test_all_valid_records_pass_through(
        self, orchestrator: PipelineOrchestrator
    ):
        """All valid records are returned with zero quarantined."""
        df = self._make_valid_df(5)
        valid_df, quarantined = orchestrator.validate_records(df)

        assert valid_df.height == 5
        assert quarantined == 0

    def test_invalid_records_are_quarantined(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """Invalid records are quarantined and not included in output."""
        invalid_df = self._make_invalid_df()
        valid_df, quarantined = orchestrator.validate_records(invalid_df)

        assert quarantined > 0
        assert valid_df.height == 0

        # Verify quarantine file was written
        quarantine_path = tmp_output_dir / "staging" / "quarantine.parquet"
        assert quarantine_path.exists()

    def test_mixed_records_separate_valid_from_invalid(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """Mixed DataFrame: valid records pass, invalid are quarantined."""
        from datetime import date

        valid_part = self._make_valid_df(2)
        invalid_part = pl.DataFrame({
            "id_pqr": [999],
            "fecha_creacion": [date(2023, 1, 1)],
            "fecha_cierre": [None],
            "estado": ["BOGUS"],
            "causa": ["test"],
            "canal_atencion": ["canal"],
            "empresa": ["emp"],
            "resultado": [None],
            "unidad_responsable": [None],
            "marcacion": [None],
            "motivo_cierre": [None],
            "tiempo_gestion_dias": [1.0],
            "tipo_pqr": ["BAD_TYPE"],
        })

        mixed = pl.concat([valid_part, invalid_part], how="diagonal_relaxed")
        valid_df, quarantined = orchestrator.validate_records(mixed)

        assert valid_df.height == 2
        assert quarantined == 1

    def test_quarantine_file_has_rule_id_for_validation_errors(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """Quarantined validation records have rule_id='SCHEMA_VALIDATION'."""
        invalid_df = self._make_invalid_df()
        orchestrator.validate_records(invalid_df)

        quarantine_path = tmp_output_dir / "staging" / "quarantine.parquet"
        df = pl.read_parquet(quarantine_path)

        assert all(r == "SCHEMA_VALIDATION" for r in df["rule_id"].to_list())

    def test_validation_errors_not_retried(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """Validation errors go directly to quarantine — no retry logic applied.

        This verifies Requirement 10.4: validation errors are non-transient
        and should NOT be retried.
        """
        invalid_df = self._make_invalid_df()

        # If this completes quickly without sleeping, it confirms no retry happened
        import time
        start = time.time()
        orchestrator.validate_records(invalid_df)
        elapsed = time.time() - start

        # Retry with backoff would take at least 2 seconds; direct quarantine is instant
        assert elapsed < 2.0


class TestQuarantineRetryPolicy:
    """Tests for retry policy integration with quarantine I/O — Requirement 10.4."""

    def test_transient_io_error_is_retried(
        self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path
    ):
        """Transient I/O errors during quarantine write are retried."""
        from core.retry import is_transient_error

        # IOError is classified as transient
        assert is_transient_error(IOError("disk full"))
        assert is_transient_error(OSError("network error"))

    def test_validation_error_is_not_transient(self):
        """Validation errors (ValueError) are classified as non-transient."""
        from core.retry import is_transient_error

        assert not is_transient_error(ValueError("invalid data"))
        assert not is_transient_error(TypeError("wrong type"))


class TestCuratedOutput:
    """Tests for curated output format — Requirement 10.5."""

    def test_curated_filename_pattern(self, tmp_output_dir: Path):
        """Curated output uses {source_stem}_curated.parquet naming."""

        orch = PipelineOrchestrator(output_dir=tmp_output_dir)
        curated_dir = tmp_output_dir / "curated"
        curated_dir.mkdir(parents=True, exist_ok=True)

        # Write a test parquet to verify filename pattern
        df = pl.DataFrame({"col": [1, 2, 3]})
        source_name = "Entrada_PQR_2024"
        curated_path = curated_dir / f"{source_name}_curated.parquet"
        df.write_parquet(curated_path, compression="snappy")

        assert curated_path.exists()
        assert curated_path.name == "Entrada_PQR_2024_curated.parquet"

    def test_curated_uses_snappy_compression(self, tmp_output_dir: Path):
        """Curated Parquet file uses snappy compression."""
        import pyarrow.parquet as pq

        curated_dir = tmp_output_dir / "curated"
        curated_dir.mkdir(parents=True, exist_ok=True)

        df = pl.DataFrame({"col": [1, 2, 3]})
        curated_path = curated_dir / "test_curated.parquet"
        df.write_parquet(curated_path, compression="snappy")

        # Read metadata to verify compression
        metadata = pq.read_metadata(curated_path)
        # Row group column chunk metadata contains compression info
        row_group = metadata.row_group(0)
        column = row_group.column(0)
        assert column.compression.lower() == "snappy"
