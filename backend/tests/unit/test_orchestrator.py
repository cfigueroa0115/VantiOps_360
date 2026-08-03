"""Unit tests for the ETL pipeline orchestrator.

Tests cover:
- SHA-256 hash computation
- Idempotency: skip reprocessing on completed hash match
- Control table schema with stages_completed, file_name, started_at, completed_at
- Sequential stage enforcement: ingest → profile → validate → enrich → serve
- Control table update logic (insert and update-in-place)

Requirements: 10.1, 10.2, 10.6, 10.7
"""

from __future__ import annotations

import hashlib
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pipeline.models import BatchStatus, IngestionBatch
from pipeline.orchestrator import (
    PIPELINE_STAGES,
    PipelineConfig,
    PipelineOrchestrator,
    PipelineResult,
)


@pytest.fixture
def tmp_output_dir(tmp_path: Path) -> Path:
    """Create a temporary output directory with serving subdirectory."""
    serving_dir = tmp_path / "serving"
    serving_dir.mkdir(parents=True)
    return tmp_path


@pytest.fixture
def orchestrator(tmp_output_dir: Path) -> PipelineOrchestrator:
    """Create an orchestrator with a temporary output directory."""
    return PipelineOrchestrator(output_dir=tmp_output_dir)


@pytest.fixture
def sample_excel_file(tmp_path: Path) -> Path:
    """Create a minimal temporary file to test hash computation."""
    file_path = tmp_path / "test_data.xlsx"
    file_path.write_bytes(b"sample excel content for testing")
    return file_path


class TestComputeFileHash:
    """Tests for SHA-256 hash computation."""

    def test_computes_sha256_hash(self, orchestrator: PipelineOrchestrator, sample_excel_file: Path):
        """SHA-256 hash is computed correctly for a file."""
        expected = hashlib.sha256(b"sample excel content for testing").hexdigest()
        result = orchestrator.compute_file_hash(sample_excel_file)
        assert result == expected

    def test_same_content_produces_same_hash(self, orchestrator: PipelineOrchestrator, tmp_path: Path):
        """Two files with identical content produce the same hash."""
        file_a = tmp_path / "a.xlsx"
        file_b = tmp_path / "b.xlsx"
        content = b"identical content"
        file_a.write_bytes(content)
        file_b.write_bytes(content)

        assert orchestrator.compute_file_hash(file_a) == orchestrator.compute_file_hash(file_b)

    def test_different_content_produces_different_hash(self, orchestrator: PipelineOrchestrator, tmp_path: Path):
        """Different file content produces different hashes."""
        file_a = tmp_path / "a.xlsx"
        file_b = tmp_path / "b.xlsx"
        file_a.write_bytes(b"content A")
        file_b.write_bytes(b"content B")

        assert orchestrator.compute_file_hash(file_a) != orchestrator.compute_file_hash(file_b)

    def test_raises_file_not_found(self, orchestrator: PipelineOrchestrator, tmp_path: Path):
        """Raises FileNotFoundError for non-existent file."""
        with pytest.raises(FileNotFoundError):
            orchestrator.compute_file_hash(tmp_path / "nonexistent.xlsx")


class TestIsAlreadyProcessed:
    """Tests for idempotency check via control table."""

    def test_returns_false_when_no_control_table(self, orchestrator: PipelineOrchestrator):
        """Returns False when control_table.json doesn't exist."""
        assert orchestrator.is_already_processed("abc123") is False

    def test_returns_false_when_hash_not_found(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Returns False when hash is not in the control table."""
        control_path = tmp_output_dir / "serving" / "control_table.json"
        control_path.write_text(json.dumps({"batches": [
            {"file_hash": "other_hash", "status": "completed"}
        ]}))

        assert orchestrator.is_already_processed("abc123") is False

    def test_returns_false_when_status_not_completed(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Returns False when hash exists but status is not 'completed'."""
        control_path = tmp_output_dir / "serving" / "control_table.json"
        control_path.write_text(json.dumps({"batches": [
            {"file_hash": "abc123", "status": "failed"}
        ]}))

        assert orchestrator.is_already_processed("abc123") is False

    def test_returns_true_when_hash_completed(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Returns True when hash exists with status 'completed'."""
        control_path = tmp_output_dir / "serving" / "control_table.json"
        control_path.write_text(json.dumps({"batches": [
            {"file_hash": "abc123", "status": "completed"}
        ]}))

        assert orchestrator.is_already_processed("abc123") is True

    def test_supports_legacy_list_format(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Supports legacy format where control table is a plain list."""
        control_path = tmp_output_dir / "serving" / "control_table.json"
        control_path.write_text(json.dumps([
            {"source_file_hash": "abc123", "status": "completed"}
        ]))

        assert orchestrator.is_already_processed("abc123") is True

    def test_handles_malformed_json(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Returns False gracefully on malformed JSON."""
        control_path = tmp_output_dir / "serving" / "control_table.json"
        control_path.write_text("not valid json {{{")

        assert orchestrator.is_already_processed("abc123") is False


class TestGetCompletedBatchEntry:
    """Tests for retrieving completed batch entries."""

    def test_returns_none_when_no_control_table(self, orchestrator: PipelineOrchestrator):
        """Returns None when no control table exists."""
        assert orchestrator.get_completed_batch_entry("abc123") is None

    def test_returns_entry_for_completed_hash(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Returns the batch entry for a completed hash."""
        entry = {"file_hash": "abc123", "status": "completed", "records_processed": 100}
        control_path = tmp_output_dir / "serving" / "control_table.json"
        control_path.write_text(json.dumps({"batches": [entry]}))

        result = orchestrator.get_completed_batch_entry("abc123")
        assert result == entry

    def test_returns_none_for_non_completed_hash(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Returns None when hash exists but status is not completed."""
        control_path = tmp_output_dir / "serving" / "control_table.json"
        control_path.write_text(json.dumps({"batches": [
            {"file_hash": "abc123", "status": "running"}
        ]}))

        assert orchestrator.get_completed_batch_entry("abc123") is None


class TestUpdateControlTable:
    """Tests for control table update logic."""

    def test_creates_control_table_with_new_schema(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Creates control table with the enhanced batches schema."""
        batch = IngestionBatch(
            batch_id="test-batch-001",
            ingestion_timestamp=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            source_file_path=Path("data/raw/test.xlsx"),
            source_file_hash="deadbeef1234",
            records_ingested=100,
            records_validated=95,
            records_quarantined=5,
            status=BatchStatus.COMPLETED,
        )

        orchestrator.update_control_table(batch, stages_completed=["ingest", "profile", "validate"])

        control_path = tmp_output_dir / "serving" / "control_table.json"
        data = json.loads(control_path.read_text())

        assert "batches" in data
        assert len(data["batches"]) == 1

        entry = data["batches"][0]
        assert entry["batch_id"] == "test-batch-001"
        assert entry["file_hash"] == "deadbeef1234"
        assert entry["file_name"] == "test.xlsx"
        assert entry["status"] == "completed"
        assert entry["stages_completed"] == ["ingest", "profile", "validate"]
        assert entry["records_processed"] == 100
        assert entry["started_at"] == "2024-01-15T10:30:00+00:00"
        assert entry["completed_at"] is not None

    def test_updates_existing_batch_in_place(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Updates an existing batch entry rather than appending duplicate."""
        batch = IngestionBatch(
            batch_id="test-batch-001",
            ingestion_timestamp=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            source_file_path=Path("data/raw/test.xlsx"),
            source_file_hash="deadbeef1234",
            status=BatchStatus.IN_PROGRESS,
        )

        # First update: in_progress with ingest stage
        orchestrator.update_control_table(batch, stages_completed=["ingest"])

        # Second update: completed with all stages
        batch.status = BatchStatus.COMPLETED
        batch.records_ingested = 100
        orchestrator.update_control_table(batch, stages_completed=PIPELINE_STAGES)

        control_path = tmp_output_dir / "serving" / "control_table.json"
        data = json.loads(control_path.read_text())

        # Should have exactly 1 entry, not 2
        assert len(data["batches"]) == 1
        entry = data["batches"][0]
        assert entry["status"] == "completed"
        assert entry["stages_completed"] == PIPELINE_STAGES
        assert entry["records_processed"] == 100

    def test_completed_at_is_null_when_not_completed(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """completed_at is null when batch status is not 'completed'."""
        batch = IngestionBatch(
            batch_id="test-batch-002",
            ingestion_timestamp=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            source_file_path=Path("data/raw/test.xlsx"),
            source_file_hash="abc123",
            status=BatchStatus.IN_PROGRESS,
        )

        orchestrator.update_control_table(batch, stages_completed=["ingest"])

        control_path = tmp_output_dir / "serving" / "control_table.json"
        data = json.loads(control_path.read_text())
        entry = data["batches"][0]
        assert entry["completed_at"] is None
        assert entry["status"] == "in_progress"

    def test_preserves_existing_batches(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """New batch entries are appended without removing existing ones."""
        control_path = tmp_output_dir / "serving" / "control_table.json"
        existing = {"batches": [
            {"batch_id": "old-batch", "file_hash": "oldhash", "status": "completed", "stages_completed": PIPELINE_STAGES}
        ]}
        control_path.write_text(json.dumps(existing))

        batch = IngestionBatch(
            batch_id="new-batch",
            ingestion_timestamp=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            source_file_path=Path("data/raw/new.xlsx"),
            source_file_hash="newhash",
            status=BatchStatus.COMPLETED,
        )
        orchestrator.update_control_table(batch, stages_completed=PIPELINE_STAGES)

        data = json.loads(control_path.read_text())
        assert len(data["batches"]) == 2
        assert data["batches"][0]["batch_id"] == "old-batch"
        assert data["batches"][1]["batch_id"] == "new-batch"


class TestPipelineStages:
    """Tests for sequential stage enforcement."""

    def test_pipeline_stages_constant_is_correct(self):
        """PIPELINE_STAGES has the 5 stages in correct order."""
        assert PIPELINE_STAGES == ["ingest", "profile", "validate", "enrich", "serve"]

    def test_pipeline_stages_are_sequential(self):
        """Each stage follows the previous one in the canonical order."""
        expected_order = ["ingest", "profile", "validate", "enrich", "serve"]
        for i, stage in enumerate(PIPELINE_STAGES):
            assert stage == expected_order[i], f"Stage {i} should be {expected_order[i]}, got {stage}"


class TestPipelineIdempotency:
    """Tests for the full pipeline idempotency behavior."""

    def test_skips_reprocessing_on_completed_hash(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path, sample_excel_file: Path):
        """Pipeline skips reprocessing when file hash is already completed."""
        # Pre-populate control table with a completed entry for this file hash
        file_hash = orchestrator.compute_file_hash(sample_excel_file)
        control_path = tmp_output_dir / "serving" / "control_table.json"
        control_path.write_text(json.dumps({"batches": [
            {"file_hash": file_hash, "status": "completed", "records_processed": 50}
        ]}))

        result = orchestrator.run(sample_excel_file)

        assert result.success is True
        assert "already processed" in result.message.lower() or "skipping" in result.message.lower()
        # Quality report should be None since processing was skipped
        assert result.quality_report is None
        assert result.quality_score is None

    def test_force_reprocess_bypasses_idempotency(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path, sample_excel_file: Path):
        """force_reprocess=True skips the idempotency check."""
        file_hash = orchestrator.compute_file_hash(sample_excel_file)
        control_path = tmp_output_dir / "serving" / "control_table.json"
        control_path.write_text(json.dumps({"batches": [
            {"file_hash": file_hash, "status": "completed", "records_processed": 50}
        ]}))

        config = PipelineConfig(
            source_path=sample_excel_file,
            output_dir=tmp_output_dir,
            force_reprocess=True,
        )

        # This will fail because sample_excel_file isn't a real Excel file,
        # but it proves the idempotency check was bypassed (it tries to ingest)
        result = orchestrator.run(sample_excel_file, config=config)

        # It should NOT skip — it should attempt processing (and likely fail on ingestion)
        assert "already processed" not in result.message.lower() or not result.success


class TestControlTableSchema:
    """Tests validating the control table JSON schema structure."""

    def test_schema_has_required_fields(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Control table entries have all required schema fields."""
        batch = IngestionBatch(
            batch_id="schema-test",
            ingestion_timestamp=datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc),
            source_file_path=Path("data/raw/schema_test.xlsx"),
            source_file_hash="hash123",
            records_ingested=200,
            status=BatchStatus.COMPLETED,
        )
        orchestrator.update_control_table(batch, stages_completed=PIPELINE_STAGES)

        control_path = tmp_output_dir / "serving" / "control_table.json"
        data = json.loads(control_path.read_text())
        entry = data["batches"][0]

        # Required fields per task specification
        required_fields = ["file_hash", "file_name", "status", "stages_completed", "records_processed", "started_at", "completed_at"]
        for field in required_fields:
            assert field in entry, f"Missing required field: {field}"

    def test_status_values_are_valid(self, orchestrator: PipelineOrchestrator, tmp_output_dir: Path):
        """Status field uses valid values: running, completed, failed."""
        for status in [BatchStatus.IN_PROGRESS, BatchStatus.COMPLETED, BatchStatus.FAILED]:
            batch = IngestionBatch(
                batch_id=f"status-{status.value}",
                ingestion_timestamp=datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc),
                source_file_path=Path("data/raw/test.xlsx"),
                source_file_hash=f"hash_{status.value}",
                status=status,
            )
            orchestrator.update_control_table(batch, stages_completed=[])

        control_path = tmp_output_dir / "serving" / "control_table.json"
        data = json.loads(control_path.read_text())

        statuses = [e["status"] for e in data["batches"]]
        assert "in_progress" in statuses
        assert "completed" in statuses
        assert "failed" in statuses
