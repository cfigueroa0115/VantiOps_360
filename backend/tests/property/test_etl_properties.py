"""
Property-based tests for ETL pipeline idempotency (Property 5).

**Validates: Requirements 10.1**

Uses Hypothesis to verify:
- P5a: For any file_hash that exists in control_table with status "completed",
       is_already_processed() returns True
- P5b: For any file_hash that does NOT exist in control_table,
       is_already_processed() returns False
- P5c: For any file_hash with status "failed" or "running",
       is_already_processed() returns False
- P5d: The SHA-256 hash is deterministic (same content → same hash)
"""

import json
import tempfile
from pathlib import Path

import hypothesis.strategies as st
from hypothesis import given, settings

from pipeline.models import BatchStatus
from pipeline.orchestrator import PipelineOrchestrator

# --- Strategies ---

# Valid SHA-256 hex hashes (64 hex chars)
sha256_hashes = st.text(
    alphabet="0123456789abcdef",
    min_size=64,
    max_size=64,
)

# Random batch IDs (UUID-like strings)
batch_ids = st.uuids().map(str)

# Status values that indicate completed processing
completed_status = st.just(BatchStatus.COMPLETED.value)

# Status values that should NOT trigger idempotency skip
non_completed_statuses = st.sampled_from(
    [
        BatchStatus.FAILED.value,
        BatchStatus.IN_PROGRESS.value,
        BatchStatus.PENDING.value,
        BatchStatus.PARTIALLY_COMPLETED.value,
    ]
)

# Random file content bytes for hash determinism testing
file_content_bytes = st.binary(min_size=1, max_size=10_000)

# Random file names
file_names = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789_-",
    min_size=3,
    max_size=30,
).map(lambda s: f"{s}.xlsx")


def _create_control_table(output_dir: Path, batches: list[dict]) -> None:
    """Helper to write a control_table.json with given batch entries."""
    serving_dir = output_dir / "serving"
    serving_dir.mkdir(parents=True, exist_ok=True)
    control_table_path = serving_dir / "control_table.json"
    control_table_path.write_text(
        json.dumps({"batches": batches}, ensure_ascii=False),
        encoding="utf-8",
    )


# --- Property Tests ---


class TestCompletedHashReturnsTrue:
    """P5a: For any file_hash in control_table with status 'completed',
    is_already_processed() returns True."""

    @given(
        file_hash=sha256_hashes,
        batch_id=batch_ids,
        file_name=file_names,
    )
    @settings(max_examples=200)
    def test_completed_hash_detected(self, file_hash: str, batch_id: str, file_name: str):
        """A hash present with 'completed' status is recognized as already processed."""
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            orchestrator = PipelineOrchestrator(output_dir=output_dir)

            # Create control table with a completed entry for the given hash
            _create_control_table(
                output_dir,
                [
                    {
                        "batch_id": batch_id,
                        "file_hash": file_hash,
                        "file_name": file_name,
                        "status": BatchStatus.COMPLETED.value,
                        "stages_completed": ["ingest", "profile", "validate", "enrich", "serve"],
                        "records_processed": 100,
                        "started_at": "2024-01-01T00:00:00Z",
                        "completed_at": "2024-01-01T00:01:00Z",
                    }
                ],
            )

            result = orchestrator.is_already_processed(file_hash)

            assert result is True, (
                f"Hash '{file_hash[:16]}...' with status 'completed' should be "
                f"detected as already processed, but returned False"
            )


class TestMissingHashReturnsFalse:
    """P5b: For any file_hash that does NOT exist in control_table,
    is_already_processed() returns False."""

    @given(
        lookup_hash=sha256_hashes,
        existing_hash=sha256_hashes,
        batch_id=batch_ids,
    )
    @settings(max_examples=200)
    def test_missing_hash_not_detected(self, lookup_hash: str, existing_hash: str, batch_id: str):
        """A hash NOT in the control table should return False."""
        # Ensure the two hashes are different
        if lookup_hash == existing_hash:
            return  # Skip degenerate case where they happen to match

        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            orchestrator = PipelineOrchestrator(output_dir=output_dir)

            # Create control table with a DIFFERENT completed hash
            _create_control_table(
                output_dir,
                [
                    {
                        "batch_id": batch_id,
                        "file_hash": existing_hash,
                        "file_name": "other_file.xlsx",
                        "status": BatchStatus.COMPLETED.value,
                        "stages_completed": ["ingest", "profile", "validate", "enrich", "serve"],
                        "records_processed": 50,
                        "started_at": "2024-01-01T00:00:00Z",
                        "completed_at": "2024-01-01T00:01:00Z",
                    }
                ],
            )

            result = orchestrator.is_already_processed(lookup_hash)

            assert result is False, (
                f"Hash '{lookup_hash[:16]}...' is NOT in control table "
                f"but was incorrectly detected as already processed"
            )

    @given(lookup_hash=sha256_hashes)
    @settings(max_examples=100)
    def test_empty_control_table_returns_false(self, lookup_hash: str):
        """When control table is empty, any hash should return False."""
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            orchestrator = PipelineOrchestrator(output_dir=output_dir)

            # Create empty control table
            _create_control_table(output_dir, [])

            result = orchestrator.is_already_processed(lookup_hash)

            assert (
                result is False
            ), f"Hash '{lookup_hash[:16]}...' should not be found in empty control table"

    @given(lookup_hash=sha256_hashes)
    @settings(max_examples=100)
    def test_no_control_table_file_returns_false(self, lookup_hash: str):
        """When control_table.json does not exist, any hash should return False."""
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            orchestrator = PipelineOrchestrator(output_dir=output_dir)

            # No control table file created at all
            result = orchestrator.is_already_processed(lookup_hash)

            assert (
                result is False
            ), f"Hash '{lookup_hash[:16]}...' should not be found when no control table exists"


class TestNonCompletedStatusReturnsFalse:
    """P5c: For any file_hash with status 'failed', 'in_progress', 'pending',
    or 'partially_completed', is_already_processed() returns False."""

    @given(
        file_hash=sha256_hashes,
        batch_id=batch_ids,
        status=non_completed_statuses,
        file_name=file_names,
    )
    @settings(max_examples=200)
    def test_non_completed_status_not_treated_as_processed(
        self, file_hash: str, batch_id: str, status: str, file_name: str
    ):
        """A hash present but with non-completed status should NOT be treated as processed."""
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            orchestrator = PipelineOrchestrator(output_dir=output_dir)

            # Create control table with the hash but non-completed status
            _create_control_table(
                output_dir,
                [
                    {
                        "batch_id": batch_id,
                        "file_hash": file_hash,
                        "file_name": file_name,
                        "status": status,
                        "stages_completed": [],
                        "records_processed": 0,
                        "started_at": "2024-01-01T00:00:00Z",
                        "completed_at": None,
                    }
                ],
            )

            result = orchestrator.is_already_processed(file_hash)

            assert result is False, (
                f"Hash '{file_hash[:16]}...' with status '{status}' should NOT be "
                f"detected as already processed, but returned True"
            )


class TestHashDeterminism:
    """P5d: The SHA-256 hash is deterministic — same content always produces the same hash."""

    @given(content=file_content_bytes)
    @settings(max_examples=200)
    def test_same_content_produces_same_hash(self, content: bytes):
        """Computing the hash of the same content twice must yield identical results."""
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            orchestrator = PipelineOrchestrator(output_dir=output_dir)

            # Write content to a temp file
            file_path = Path(tmp) / "test_file.xlsx"
            file_path.write_bytes(content)

            hash_1 = orchestrator.compute_file_hash(file_path)
            hash_2 = orchestrator.compute_file_hash(file_path)

            assert (
                hash_1 == hash_2
            ), f"Hash is not deterministic: first={hash_1[:16]}..., second={hash_2[:16]}..."

    @given(content=file_content_bytes)
    @settings(max_examples=200)
    def test_hash_is_valid_sha256_format(self, content: bytes):
        """The computed hash must be a valid 64-character hex string (SHA-256 format)."""
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            orchestrator = PipelineOrchestrator(output_dir=output_dir)

            file_path = Path(tmp) / "test_file.xlsx"
            file_path.write_bytes(content)

            file_hash = orchestrator.compute_file_hash(file_path)

            assert len(file_hash) == 64, f"Hash length is {len(file_hash)}, expected 64 for SHA-256"
            assert all(
                c in "0123456789abcdef" for c in file_hash
            ), f"Hash contains invalid characters: {file_hash}"

    @given(content_a=file_content_bytes, content_b=file_content_bytes)
    @settings(max_examples=200)
    def test_different_content_produces_different_hash(self, content_a: bytes, content_b: bytes):
        """Different content should produce different hashes (collision resistance)."""
        if content_a == content_b:
            return  # Skip when randomly generated content is identical

        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            orchestrator = PipelineOrchestrator(output_dir=output_dir)

            file_a = Path(tmp) / "file_a.xlsx"
            file_b = Path(tmp) / "file_b.xlsx"
            file_a.write_bytes(content_a)
            file_b.write_bytes(content_b)

            hash_a = orchestrator.compute_file_hash(file_a)
            hash_b = orchestrator.compute_file_hash(file_b)

            assert hash_a != hash_b, (
                f"Different content produced same hash: {hash_a[:16]}... "
                f"This should be astronomically unlikely for SHA-256."
            )
