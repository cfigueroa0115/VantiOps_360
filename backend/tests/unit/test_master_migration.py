"""Unit tests for the master records migration module.

Tests cover:
- Profile stage (read source, handle missing file)
- Clean stage (lowercase, trim whitespace)
- Validate stage (schema rules, quarantine invalid records)
- Load stage (UPSERT via DB mock, idempotency via ON CONFLICT DO NOTHING)
- Reconcile stage (source vs destination count comparison)
- Report generation (JSON with required fields, success rate threshold)
- Full pipeline run end-to-end (mocked DB)

Requirements: 19.1, 19.2, 19.5, 19.6, 19.7
"""

from __future__ import annotations

import json
import tempfile
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import polars as pl
import pytest

from migration.master_records import (
    DEFAULT_SOURCE_PATH,
    MIN_SUCCESS_RATE,
    VALID_ESTADOS,
    VALID_TIPOS_PQR,
    MasterMigrationPipeline,
    MigrationAbortError,
    MigrationConfig,
    MigrationReport,
    QuarantinedRecord,
)


# ─── Fixtures ────────────────────────────────────────────────────────


def _make_valid_df(n: int = 10) -> pl.DataFrame:
    """Create a valid PQR DataFrame with n records."""
    return pl.DataFrame({
        "id_pqr": list(range(1, n + 1)),
        "fecha_creacion": [date(2023, 1, i % 28 + 1) for i in range(n)],
        "fecha_cierre": [date(2023, 2, i % 28 + 1) for i in range(n)],
        "estado": ["cerrado" if i % 3 == 0 else "en_proceso" if i % 3 == 1 else "abierto" for i in range(n)],
        "causa": [f"causa_{i}" for i in range(n)],
        "canal_atencion": [f"canal_{i}" for i in range(n)],
        "empresa": [f"empresa_{i}" for i in range(n)],
        "resultado": [f"resultado_{i}" for i in range(n)],
        "unidad_responsable": [f"unidad_{i}" for i in range(n)],
        "marcacion": [f"marcacion_{i}" for i in range(n)],
        "motivo_cierre": [f"motivo_{i}" for i in range(n)],
        "tiempo_gestion_dias": [float(i * 2) for i in range(n)],
        "tipo_pqr": ["peticion" if i % 3 == 0 else "queja" if i % 3 == 1 else "reclamo" for i in range(n)],
    })


def _make_mock_db(success: bool = True) -> MagicMock:
    """Create a mock database connection."""
    mock_db = MagicMock()

    def mock_upsert(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        results = []
        for record in records:
            results.append({
                "source_record_id": str(record.get("id_pqr", "unknown")),
                "status": "migrated" if success else "failed",
                "error": None if success else "simulated failure",
            })
        return results

    mock_db.execute_upsert.side_effect = mock_upsert
    mock_db.count_migrated.return_value = 0
    return mock_db


@pytest.fixture
def tmp_dir(tmp_path: Path) -> Path:
    """Create temp directory structure for migration tests."""
    (tmp_path / "data" / "curated").mkdir(parents=True)
    (tmp_path / "data" / "reports").mkdir(parents=True)
    (tmp_path / "staging").mkdir(parents=True)
    return tmp_path


@pytest.fixture
def source_parquet(tmp_dir: Path) -> Path:
    """Create a source parquet file with valid records."""
    df = _make_valid_df(20)
    path = tmp_dir / "data" / "curated" / "pqr_curated.parquet"
    df.write_parquet(path)
    return path


@pytest.fixture
def config(tmp_dir: Path, source_parquet: Path) -> MigrationConfig:
    """Create a MigrationConfig pointing to temp dirs."""
    return MigrationConfig(
        source_path=source_parquet,
        report_dir=tmp_dir / "data" / "reports",
        quarantine_path=tmp_dir / "staging" / "migration_quarantine.parquet",
        batch_size=10,
    )


@pytest.fixture
def pipeline(config: MigrationConfig) -> MasterMigrationPipeline:
    """Create a pipeline with mock DB."""
    db = _make_mock_db(success=True)
    return MasterMigrationPipeline(db=db, config=config)


# ─── Profile Stage Tests ─────────────────────────────────────────────


class TestProfile:
    """Tests for the profile stage."""

    def test_profile_reads_parquet(self, pipeline: MasterMigrationPipeline, source_parquet: Path):
        """Profile stage reads the source parquet file correctly."""
        df = pipeline.profile(source_parquet)
        assert df.height == 20
        assert "id_pqr" in df.columns
        assert "estado" in df.columns

    def test_profile_raises_on_missing_file(self, pipeline: MasterMigrationPipeline, tmp_dir: Path):
        """Profile stage raises FileNotFoundError for missing source."""
        missing_path = tmp_dir / "nonexistent.parquet"
        with pytest.raises(FileNotFoundError, match="Source file not found"):
            pipeline.profile(missing_path)

    def test_profile_returns_all_columns(self, pipeline: MasterMigrationPipeline, source_parquet: Path):
        """Profile returns DataFrame with all expected PQR columns."""
        df = pipeline.profile(source_parquet)
        expected_cols = {"id_pqr", "estado", "causa", "canal_atencion", "empresa", "tipo_pqr"}
        assert expected_cols.issubset(set(df.columns))


# ─── Clean Stage Tests ───────────────────────────────────────────────


class TestClean:
    """Tests for the clean stage."""

    def test_clean_lowercases_estado(self, pipeline: MasterMigrationPipeline):
        """Clean stage lowercases the estado field."""
        df = pl.DataFrame({
            "id_pqr": [1, 2, 3],
            "estado": ["CERRADO", "En_Proceso", "ABIERTO"],
            "tipo_pqr": ["peticion", "queja", "reclamo"],
            "causa": ["c1", "c2", "c3"],
            "canal_atencion": ["canal1", "canal2", "canal3"],
            "empresa": ["emp1", "emp2", "emp3"],
        })
        cleaned = pipeline.clean(df)
        assert cleaned["estado"].to_list() == ["cerrado", "en_proceso", "abierto"]

    def test_clean_lowercases_tipo_pqr(self, pipeline: MasterMigrationPipeline):
        """Clean stage lowercases the tipo_pqr field."""
        df = pl.DataFrame({
            "id_pqr": [1, 2],
            "estado": ["cerrado", "abierto"],
            "tipo_pqr": ["PETICION", "Queja"],
            "causa": ["c1", "c2"],
            "canal_atencion": ["canal1", "canal2"],
            "empresa": ["emp1", "emp2"],
        })
        cleaned = pipeline.clean(df)
        assert cleaned["tipo_pqr"].to_list() == ["peticion", "queja"]

    def test_clean_trims_whitespace(self, pipeline: MasterMigrationPipeline):
        """Clean stage trims whitespace from string columns."""
        df = pl.DataFrame({
            "id_pqr": [1],
            "estado": ["  cerrado  "],
            "tipo_pqr": [" peticion "],
            "causa": ["  causa1  "],
            "canal_atencion": [" canal1 "],
            "empresa": [" empresa1 "],
        })
        cleaned = pipeline.clean(df)
        assert cleaned["causa"][0] == "causa1"
        assert cleaned["canal_atencion"][0] == "canal1"
        assert cleaned["empresa"][0] == "empresa1"
        assert cleaned["estado"][0] == "cerrado"


# ─── Validate Stage Tests ────────────────────────────────────────────


class TestValidate:
    """Tests for the validate stage."""

    def test_validate_passes_valid_records(self, pipeline: MasterMigrationPipeline):
        """Valid records pass validation without quarantine."""
        df = _make_valid_df(5)
        valid_df, quarantined = pipeline.validate(df)
        assert valid_df.height == 5
        assert len(quarantined) == 0

    def test_validate_quarantines_invalid_estado(self, pipeline: MasterMigrationPipeline):
        """Records with invalid estado are quarantined."""
        df = pl.DataFrame({
            "id_pqr": [1, 2],
            "estado": ["cerrado", "invalido"],
            "tipo_pqr": ["peticion", "queja"],
            "causa": ["c1", "c2"],
            "canal_atencion": ["canal1", "canal2"],
            "empresa": ["emp1", "emp2"],
            "tiempo_gestion_dias": [1.0, 2.0],
        })
        valid_df, quarantined = pipeline.validate(df)
        assert valid_df.height == 1
        assert len(quarantined) == 1
        assert quarantined[0].failed_field == "estado"
        assert quarantined[0].rule_violated == "isin:cerrado,en_proceso,abierto"

    def test_validate_quarantines_null_id_pqr(self, pipeline: MasterMigrationPipeline):
        """Records with null id_pqr are quarantined."""
        df = pl.DataFrame({
            "id_pqr": [None, 2],
            "estado": ["cerrado", "abierto"],
            "tipo_pqr": ["peticion", "queja"],
            "causa": ["c1", "c2"],
            "canal_atencion": ["canal1", "canal2"],
            "empresa": ["emp1", "emp2"],
            "tiempo_gestion_dias": [1.0, 2.0],
        }).cast({"id_pqr": pl.Int64})
        valid_df, quarantined = pipeline.validate(df)
        assert valid_df.height == 1
        assert any(q.failed_field == "id_pqr" for q in quarantined)

    def test_validate_quarantines_empty_causa(self, pipeline: MasterMigrationPipeline):
        """Records with empty causa are quarantined."""
        df = pl.DataFrame({
            "id_pqr": [1, 2],
            "estado": ["cerrado", "abierto"],
            "tipo_pqr": ["peticion", "queja"],
            "causa": ["valid_causa", ""],
            "canal_atencion": ["canal1", "canal2"],
            "empresa": ["emp1", "emp2"],
            "tiempo_gestion_dias": [1.0, 2.0],
        })
        valid_df, quarantined = pipeline.validate(df)
        assert valid_df.height == 1
        assert any(q.failed_field == "causa" for q in quarantined)

    def test_validate_quarantines_negative_tiempo(self, pipeline: MasterMigrationPipeline):
        """Records with negative tiempo_gestion_dias are quarantined."""
        df = pl.DataFrame({
            "id_pqr": [1, 2],
            "estado": ["cerrado", "abierto"],
            "tipo_pqr": ["peticion", "queja"],
            "causa": ["c1", "c2"],
            "canal_atencion": ["canal1", "canal2"],
            "empresa": ["emp1", "emp2"],
            "tiempo_gestion_dias": [5.0, -1.0],
        })
        valid_df, quarantined = pipeline.validate(df)
        assert valid_df.height == 1
        assert any(q.failed_field == "tiempo_gestion_dias" for q in quarantined)

    def test_validate_quarantines_invalid_tipo_pqr(self, pipeline: MasterMigrationPipeline):
        """Records with invalid tipo_pqr are quarantined."""
        df = pl.DataFrame({
            "id_pqr": [1, 2],
            "estado": ["cerrado", "abierto"],
            "tipo_pqr": ["peticion", "invalido_tipo"],
            "causa": ["c1", "c2"],
            "canal_atencion": ["canal1", "canal2"],
            "empresa": ["emp1", "emp2"],
            "tiempo_gestion_dias": [1.0, 2.0],
        })
        valid_df, quarantined = pipeline.validate(df)
        assert valid_df.height == 1
        assert any(q.failed_field == "tipo_pqr" for q in quarantined)


# ─── Load Stage Tests ────────────────────────────────────────────────


class TestLoad:
    """Tests for the load stage (UPSERT with idempotency)."""

    def test_load_all_success(self, config: MigrationConfig):
        """All records migrate successfully."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        df = _make_valid_df(10)
        success, failed, details = pipeline.load(df)
        assert success == 10
        assert failed == 0
        assert details == []

    def test_load_all_failure(self, config: MigrationConfig):
        """All records fail to migrate."""
        db = _make_mock_db(success=False)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        df = _make_valid_df(5)
        success, failed, details = pipeline.load(df)
        assert success == 0
        assert failed == 5
        assert len(details) == 5

    def test_load_connection_error_marks_batch_failed(self, config: MigrationConfig):
        """ConnectionError after retries aborts the pipeline (REQ-19.4)."""
        db = MagicMock()
        db.execute_upsert.side_effect = ConnectionError("Neon connection refused")
        pipeline = MasterMigrationPipeline(db=db, config=config)

        # Override retry to not actually wait
        pipeline._load_batch = MagicMock(side_effect=ConnectionError("Neon connection refused"))

        df = _make_valid_df(3)
        with pytest.raises(MigrationAbortError) as exc_info:
            pipeline.load(df)
        assert exc_info.value.records_loaded == 0
        assert "Connection failed" in exc_info.value.reason

    def test_load_uses_batching(self, config: MigrationConfig):
        """Load processes records in configured batch sizes."""
        db = _make_mock_db(success=True)
        config.batch_size = 5
        pipeline = MasterMigrationPipeline(db=db, config=config)
        df = _make_valid_df(12)
        success, failed, details = pipeline.load(df)
        assert success == 12
        # 12 records / batch_size 5 = 3 batches
        assert db.execute_upsert.call_count == 3

    def test_load_upsert_idempotency(self, config: MigrationConfig):
        """UPSERT semantics: re-execution produces same result (ON CONFLICT DO NOTHING)."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        df = _make_valid_df(5)

        # First run
        s1, f1, _ = pipeline.load(df)
        # Second run (simulates re-execution)
        s2, f2, _ = pipeline.load(df)

        # Both runs succeed (idempotent - ON CONFLICT DO NOTHING means no error)
        assert s1 == s2 == 5
        assert f1 == f2 == 0


# ─── Reconcile Stage Tests ───────────────────────────────────────────


class TestReconcile:
    """Tests for the reconcile stage."""

    def test_reconcile_matching_counts(self, pipeline: MasterMigrationPipeline):
        """Reconcile confirms source == loaded + quarantined."""
        result = pipeline.reconcile(source_count=10, success_count=10)
        assert result["source_count"] == 10
        assert result["loaded_count"] == 10
        assert result["match"] is True

    def test_reconcile_with_quarantined(self, config: MigrationConfig):
        """Reconcile accounts for quarantined records."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        # Simulate 3 quarantined records
        pipeline._quarantined = [
            QuarantinedRecord(record_id="1", failed_field="f", rule_violated="r", rejected_value="v"),
            QuarantinedRecord(record_id="2", failed_field="f", rule_violated="r", rejected_value="v"),
            QuarantinedRecord(record_id="3", failed_field="f", rule_violated="r", rejected_value="v"),
        ]
        result = pipeline.reconcile(source_count=10, success_count=7)
        assert result["quarantined_count"] == 3
        assert result["match"] is True


# ─── Report Generation Tests ─────────────────────────────────────────


class TestReport:
    """Tests for report generation."""

    def test_report_contains_required_fields(self, pipeline: MasterMigrationPipeline):
        """Report contains all required fields per REQ-19.5."""
        report = pipeline.generate_report(
            total_records=600,
            success_count=580,
            failed_count=20,
            duration_seconds=45.5,
            started_at="2024-01-15T10:00:00Z",
            completed_at="2024-01-15T10:00:45Z",
        )
        report_dict = report.to_dict()
        required_keys = {
            "batch_id", "total_records", "success_count", "failed_count",
            "quarantined_count", "success_rate", "duration_seconds",
            "started_at", "completed_at", "status", "quarantined_records",
            "reconciliation_status",
        }
        assert required_keys.issubset(set(report_dict.keys()))

    def test_report_success_rate_calculation(self, pipeline: MasterMigrationPipeline):
        """Success rate is correctly calculated."""
        report = pipeline.generate_report(
            total_records=600,
            success_count=570,
            failed_count=30,
            duration_seconds=45.0,
            started_at="2024-01-15T10:00:00Z",
            completed_at="2024-01-15T10:00:45Z",
        )
        assert report.success_rate == 95.0
        assert report.is_successful is True

    def test_report_below_threshold_fails(self, pipeline: MasterMigrationPipeline):
        """Success rate below 95% marks migration as failed (REQ-19.6)."""
        report = pipeline.generate_report(
            total_records=600,
            success_count=560,
            failed_count=40,
            duration_seconds=45.0,
            started_at="2024-01-15T10:00:00Z",
            completed_at="2024-01-15T10:00:45Z",
        )
        assert report.success_rate < MIN_SUCCESS_RATE
        assert report.is_successful is False
        assert report.status == "failed"

    def test_report_save_creates_json(self, pipeline: MasterMigrationPipeline, config: MigrationConfig):
        """save_report writes a valid JSON file."""
        report = pipeline.generate_report(
            total_records=100,
            success_count=98,
            failed_count=2,
            duration_seconds=10.0,
            started_at="2024-01-15T10:00:00Z",
            completed_at="2024-01-15T10:00:10Z",
        )
        path = pipeline.save_report(report)
        assert path.exists()
        data = json.loads(path.read_text())
        assert data["total_records"] == 100
        assert data["success_count"] == 98

    def test_report_includes_quarantined_records(self, config: MigrationConfig):
        """Report includes quarantined records list."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        pipeline._quarantined = [
            QuarantinedRecord(
                record_id="42",
                failed_field="estado",
                rule_violated="isin",
                rejected_value="invalid",
            ),
        ]
        report = pipeline.generate_report(
            total_records=10,
            success_count=9,
            failed_count=1,
            duration_seconds=5.0,
            started_at="2024-01-15T10:00:00Z",
            completed_at="2024-01-15T10:00:05Z",
        )
        assert report.quarantined_count == 1
        assert len(report.quarantined_records) == 1
        assert report.quarantined_records[0]["record_id"] == "42"


# ─── Quarantine Save Tests ───────────────────────────────────────────


class TestQuarantine:
    """Tests for quarantine file saving."""

    def test_save_quarantine_creates_parquet(self, config: MigrationConfig):
        """save_quarantine writes parquet file with quarantined records."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        pipeline._quarantined = [
            QuarantinedRecord(
                record_id="100",
                failed_field="estado",
                rule_violated="isin",
                rejected_value="bad_state",
            ),
        ]
        path = pipeline.save_quarantine()
        assert path is not None
        assert path.exists()
        df = pl.read_parquet(path)
        assert df.height == 1
        assert df["record_id"][0] == "100"

    def test_save_quarantine_returns_none_when_empty(self, config: MigrationConfig):
        """save_quarantine returns None when no records are quarantined."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        path = pipeline.save_quarantine()
        assert path is None


# ─── Full Pipeline Tests ─────────────────────────────────────────────


class TestFullPipeline:
    """Tests for the full migration pipeline run."""

    def test_full_pipeline_success(self, config: MigrationConfig, source_parquet: Path):
        """Full pipeline runs successfully with all valid records."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        report = pipeline.run(source_parquet)

        assert report.total_records == 20
        assert report.success_count == 20
        assert report.success_rate == 100.0
        assert report.is_successful is True
        assert report.status == "completed"
        assert report.duration_seconds >= 0

    def test_full_pipeline_with_invalid_records(self, config: MigrationConfig, tmp_dir: Path):
        """Full pipeline handles mix of valid and invalid records."""
        # Create source with some invalid records
        df = pl.DataFrame({
            "id_pqr": [1, 2, 3, 4, 5],
            "estado": ["cerrado", "invalido", "abierto", "en_proceso", "cerrado"],
            "tipo_pqr": ["peticion", "queja", "reclamo", "peticion", "queja"],
            "causa": ["c1", "c2", "c3", "c4", "c5"],
            "canal_atencion": ["ch1", "ch2", "ch3", "ch4", "ch5"],
            "empresa": ["e1", "e2", "e3", "e4", "e5"],
            "tiempo_gestion_dias": [1.0, 2.0, 3.0, 4.0, 5.0],
        })
        source_path = tmp_dir / "data" / "curated" / "mixed.parquet"
        df.write_parquet(source_path)

        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        report = pipeline.run(source_path)

        # Record with "invalido" estado should be quarantined
        assert report.total_records == 5
        assert report.success_count == 4
        assert report.quarantined_count == 1

    def test_full_pipeline_generates_report_file(self, config: MigrationConfig, source_parquet: Path):
        """Full pipeline creates report JSON file."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        pipeline.run(source_parquet)

        report_path = config.report_dir / "migration_report.json"
        assert report_path.exists()
        data = json.loads(report_path.read_text())
        assert "total_records" in data
        assert "success_rate" in data
        assert "duration_seconds" in data
        assert "reconciliation_status" in data

    def test_full_pipeline_idempotent_rerun(self, config: MigrationConfig, source_parquet: Path):
        """Running pipeline twice produces consistent results (idempotency)."""
        db = _make_mock_db(success=True)

        # First run
        pipeline1 = MasterMigrationPipeline(db=db, config=config)
        report1 = pipeline1.run(source_parquet)

        # Second run (simulates re-execution)
        pipeline2 = MasterMigrationPipeline(db=db, config=config)
        report2 = pipeline2.run(source_parquet)

        assert report1.success_count == report2.success_count
        assert report1.total_records == report2.total_records


# ─── Retry + Abort Behavior Tests (REQ-19.3, 19.4) ──────────────────


class TestRetryAndAbort:
    """Tests for migration retry policy and abort behavior.

    Requirements: 19.3, 19.4
    - Retry policy is applied for Neon connection failures
    - If all retries exhausted, pipeline aborts and preserves existing data
    - Failed validation records go to quarantine with 4 required fields
    """

    def test_abort_preserves_already_loaded_records(self, config: MigrationConfig):
        """When abort occurs mid-pipeline, previously loaded batches remain intact (REQ-19.4)."""
        call_count = 0

        def upsert_then_fail(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # First batch succeeds
                return [{"source_record_id": str(r.get("id_pqr")), "status": "migrated", "error": None} for r in records]
            # Second batch raises connection error (simulating retries exhausted)
            raise ConnectionError("Neon PostgreSQL connection lost")

        db = MagicMock()
        db.execute_upsert.side_effect = upsert_then_fail
        config.batch_size = 5
        pipeline = MasterMigrationPipeline(db=db, config=config)
        # Override _load_batch to bypass retry decorator for testing
        pipeline._load_batch = upsert_then_fail

        df = _make_valid_df(10)

        with pytest.raises(MigrationAbortError) as exc_info:
            pipeline.load(df)

        # First batch of 5 loaded successfully before abort
        assert exc_info.value.records_loaded == 5
        # Remaining records from the failing batch onward
        assert exc_info.value.records_remaining == 5

    def test_abort_does_not_write_partial_data(self, config: MigrationConfig, tmp_dir: Path):
        """Abort produces report with status 'aborted', not 'completed' (REQ-19.4)."""
        db = MagicMock()
        db.execute_upsert.side_effect = ConnectionError("Connection refused")

        pipeline = MasterMigrationPipeline(db=db, config=config)
        # Override _load_batch to bypass retry decorator
        pipeline._load_batch = MagicMock(side_effect=ConnectionError("Connection refused"))

        # Create source file
        df = _make_valid_df(10)
        source_path = config.source_path
        source_path.parent.mkdir(parents=True, exist_ok=True)
        df.write_parquet(source_path)

        report = pipeline.run(source_path)

        # Pipeline should produce aborted report
        assert report.status == "aborted"
        assert report.success_count == 0
        # Report file is still saved (for audit trail)
        report_path = config.report_dir / "migration_report.json"
        assert report_path.exists()

    def test_timeout_error_triggers_abort(self, config: MigrationConfig):
        """TimeoutError also triggers abort after retries exhausted (REQ-19.4)."""
        db = MagicMock()
        pipeline = MasterMigrationPipeline(db=db, config=config)
        pipeline._load_batch = MagicMock(side_effect=TimeoutError("Connection timed out"))

        df = _make_valid_df(5)
        with pytest.raises(MigrationAbortError) as exc_info:
            pipeline.load(df)
        assert "Connection failed" in exc_info.value.reason

    def test_os_error_triggers_abort(self, config: MigrationConfig):
        """OSError (network-level) also triggers abort after retries exhausted (REQ-19.4)."""
        db = MagicMock()
        pipeline = MasterMigrationPipeline(db=db, config=config)
        pipeline._load_batch = MagicMock(side_effect=OSError("Network unreachable"))

        df = _make_valid_df(5)
        with pytest.raises(MigrationAbortError) as exc_info:
            pipeline.load(df)
        assert "Connection failed" in exc_info.value.reason

    def test_quarantine_has_required_fields(self, config: MigrationConfig):
        """Quarantine parquet contains all 4 required fields (REQ-19.3)."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)

        # Create data with an invalid record
        df = pl.DataFrame({
            "id_pqr": [1, 2, 3],
            "estado": ["cerrado", "invalido_state", "abierto"],
            "tipo_pqr": ["peticion", "queja", "reclamo"],
            "causa": ["c1", "c2", "c3"],
            "canal_atencion": ["ch1", "ch2", "ch3"],
            "empresa": ["e1", "e2", "e3"],
            "tiempo_gestion_dias": [1.0, 2.0, 3.0],
        })

        # Validate to quarantine invalid records
        valid_df, quarantined = pipeline.validate(df)
        assert len(quarantined) == 1

        # Save quarantine and check the file
        path = pipeline.save_quarantine()
        assert path is not None
        assert path.exists()

        quarantine_df = pl.read_parquet(path)
        # Must contain the 4 required fields
        assert "record_id" in quarantine_df.columns
        assert "failed_field" in quarantine_df.columns
        assert "rule_violated" in quarantine_df.columns
        assert "rejected_value" in quarantine_df.columns

        # Verify field values
        row = quarantine_df.row(0, named=True)
        assert row["record_id"] == "2"
        assert row["failed_field"] == "estado"
        assert "isin" in row["rule_violated"]
        assert row["rejected_value"] == "invalido_state"

    def test_quarantine_file_written_to_correct_path(self, config: MigrationConfig):
        """Quarantine is written to staging/migration_quarantine.parquet (REQ-19.3)."""
        db = _make_mock_db(success=True)
        pipeline = MasterMigrationPipeline(db=db, config=config)
        pipeline._quarantined = [
            QuarantinedRecord(
                record_id="99",
                failed_field="tipo_pqr",
                rule_violated="isin:peticion,queja,reclamo",
                rejected_value="solicitud",
            ),
        ]
        path = pipeline.save_quarantine()
        assert path is not None
        assert "migration_quarantine.parquet" in str(path)
        assert path == config.quarantine_path

    def test_retry_policy_applied_to_load_batch(self):
        """_load_batch method has the retry_policy decorator applied."""
        # Verify the method has retry behavior by checking it's decorated
        # The retry_policy wraps the function — check that the wrapper exists
        method = MasterMigrationPipeline._load_batch
        assert hasattr(method, "__wrapped__") or "wrapper" in (method.__qualname__ or "")

    def test_full_pipeline_abort_saves_quarantine(self, config: MigrationConfig, tmp_dir: Path):
        """Full pipeline on connection failure still saves quarantine records (REQ-19.3, 19.4)."""
        db = MagicMock()
        db.execute_upsert.side_effect = ConnectionError("Neon down")

        # Create source with a mix of valid and invalid records
        df = pl.DataFrame({
            "id_pqr": [1, 2, 3, 4, 5],
            "estado": ["cerrado", "invalido", "abierto", "en_proceso", "cerrado"],
            "tipo_pqr": ["peticion", "queja", "reclamo", "peticion", "queja"],
            "causa": ["c1", "c2", "c3", "c4", "c5"],
            "canal_atencion": ["ch1", "ch2", "ch3", "ch4", "ch5"],
            "empresa": ["e1", "e2", "e3", "e4", "e5"],
            "tiempo_gestion_dias": [1.0, 2.0, 3.0, 4.0, 5.0],
        })
        source_path = config.source_path
        source_path.parent.mkdir(parents=True, exist_ok=True)
        df.write_parquet(source_path)

        pipeline = MasterMigrationPipeline(db=db, config=config)
        # Override _load_batch to bypass retry decorator
        pipeline._load_batch = MagicMock(side_effect=ConnectionError("Neon down"))

        report = pipeline.run(source_path)

        # Pipeline aborted
        assert report.status == "aborted"

        # Quarantine file should still be saved for the validation-failed record
        assert config.quarantine_path.exists()
        quarantine_df = pl.read_parquet(config.quarantine_path)
        assert quarantine_df.height >= 1  # At least the "invalido" record

    def test_migration_abort_error_attributes(self):
        """MigrationAbortError carries useful debugging info."""
        err = MigrationAbortError(
            reason="Connection timed out",
            records_loaded=25,
            records_remaining=75,
        )
        assert err.records_loaded == 25
        assert err.records_remaining == 75
        assert "Connection timed out" in str(err)
        assert "Existing data preserved" in str(err)
