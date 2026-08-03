"""Pipeline orchestrator for full data pipeline execution.

Coordinates the multi-stage data pipeline: ingest → profile → validate →
enrich → serve. Implements idempotent processing via SHA-256 file hashing,
exponential backoff retries, record quarantining, and control table tracking.

The control table (serving/control_table.json) uses a batches-based schema
that tracks per-stage completion for observability and resume support.

Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import polars as pl

from core.retry import retry_policy
from ingestion.excel_adapter import ExcelIngestionAdapter
from pipeline.models import BatchStatus, IngestionBatch
from pipeline.schemas import PQRSchema
from quality.models import QualityReport, QualityScore
from quality.report_generator import QualityReportGenerator
from quality.score_computer import QualityScoreComputer

logger = logging.getLogger(__name__)

# Canonical sequential pipeline stages (Requirement 10.2)
PIPELINE_STAGES: list[str] = ["ingest", "profile", "validate", "enrich", "serve"]


@dataclass
class PipelineConfig:
    """Configuration for a pipeline execution run.

    Attributes:
        source_path: Path to the source data file.
        output_dir: Base directory for all data layers (raw, staging, curated, serving).
        force_reprocess: If True, skip idempotency check and reprocess even if hash exists.
    """

    source_path: Path
    output_dir: Path = field(default_factory=lambda: Path("data"))
    force_reprocess: bool = False


@dataclass
class PipelineResult:
    """Result of a full pipeline execution.

    Attributes:
        success: Whether the pipeline completed successfully.
        batch: IngestionBatch record with processing metrics.
        quality_report: Generated quality report (None if pipeline failed early).
        quality_score: Computed quality score (None if pipeline failed early).
        errors: List of error messages encountered during execution.
        message: Human-readable summary of the pipeline run.
    """

    success: bool
    batch: IngestionBatch
    quality_report: QualityReport | None
    quality_score: QualityScore | None
    errors: list[str]
    message: str


class PipelineOrchestrator:
    """Coordinates the full data pipeline execution.

    Manages idempotent processing through file hashing, retry logic with
    exponential backoff, record quarantining for failed validations, and
    control table tracking for observability.

    The pipeline stages are:
    1. Ingest: Read source file via ExcelIngestionAdapter
    2. Profile: Type inference, null stats, outliers, duplicates, dates, similarity
    3. Validate: Generate quality report
    4. Enrich: Compute quality score
    5. Serve: Store curated Parquet and update control table

    Args:
        output_dir: Base directory for data layers. Defaults to Path("data").
        id_column: Name of the PQR identifier column. Defaults to "id_pqr".
    """

    # Control table file path relative to output_dir
    _CONTROL_TABLE_RELATIVE = Path("serving") / "control_table.json"
    # Quarantine file path relative to output_dir
    _QUARANTINE_RELATIVE = Path("staging") / "quarantine.parquet"
    # Curated output relative path
    _CURATED_RELATIVE = Path("curated")

    def __init__(
        self,
        output_dir: Path | None = None,
        id_column: str = "id_pqr",
    ) -> None:
        self.output_dir = output_dir or Path("data")
        self.id_column = id_column
        self._adapter = ExcelIngestionAdapter()
        self._report_generator = QualityReportGenerator(id_column=id_column)
        self._score_computer = QualityScoreComputer(id_column=id_column)

    def compute_file_hash(self, path: Path) -> str:
        """Compute SHA-256 hash of a file for idempotent processing.

        Reads the file in 8KB chunks to handle large files efficiently.

        Args:
            path: Path to the file to hash.

        Returns:
            Hexadecimal SHA-256 hash string.

        Raises:
            FileNotFoundError: If the file does not exist.
            PermissionError: If the file is not readable.
        """
        sha256 = hashlib.sha256()
        with open(path, "rb") as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                sha256.update(chunk)
        return sha256.hexdigest()

    def is_already_processed(self, file_hash: str) -> bool:
        """Check the control table for whether a file hash was already processed.

        Reads the JSON control table and checks if any batch entry has a
        matching file_hash with a 'completed' status.

        Args:
            file_hash: SHA-256 hash string to look up.

        Returns:
            True if the hash is found in a completed batch, False otherwise.
        """
        control_table_path = self.output_dir / self._CONTROL_TABLE_RELATIVE

        if not control_table_path.exists():
            return False

        try:
            with open(control_table_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return False

        # Support both legacy (list of entries) and new schema ({"batches": [...]})
        batches = data.get("batches", data) if isinstance(data, dict) else data

        for entry in batches:
            hash_field = entry.get("file_hash") or entry.get("source_file_hash")
            if hash_field == file_hash and entry.get("status") == BatchStatus.COMPLETED.value:
                return True

        return False

    def get_completed_batch_entry(self, file_hash: str) -> dict[str, Any] | None:
        """Retrieve the completed batch entry for a given file hash.

        Used during idempotency checks to return existing results without
        reprocessing.

        Args:
            file_hash: SHA-256 hash string to look up.

        Returns:
            The batch entry dict if found with status "completed", else None.
        """
        control_table_path = self.output_dir / self._CONTROL_TABLE_RELATIVE

        if not control_table_path.exists():
            return None

        try:
            with open(control_table_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

        batches = data.get("batches", data) if isinstance(data, dict) else data

        for entry in batches:
            hash_field = entry.get("file_hash") or entry.get("source_file_hash")
            if hash_field == file_hash and entry.get("status") == BatchStatus.COMPLETED.value:
                return entry

        return None

    def retry_with_backoff(
        self,
        operation: Callable[[], Any],
        max_retries: int = 3,
        base_wait: float = 2.0,
    ) -> Any:
        """Execute an operation with exponential backoff retry logic.

        Retries the operation on failure with increasing wait times:
        base_wait * 2^attempt (e.g., 2s, 4s, 8s), capped at 30 seconds.

        Args:
            operation: Callable to execute. Must take no arguments.
            max_retries: Maximum number of retry attempts. Defaults to 3.
            base_wait: Base wait time in seconds. Defaults to 2.0.

        Returns:
            The result of the successful operation call.

        Raises:
            Exception: The last exception raised after all retries are exhausted.
        """
        last_exception: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                return operation()
            except Exception as e:
                last_exception = e
                if attempt < max_retries:
                    wait_time = min(base_wait * (2**attempt), 30.0)
                    logger.warning(
                        f"Operation failed (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                        f"Retrying in {wait_time:.1f}s..."
                    )
                    time.sleep(wait_time)
                else:
                    logger.error(
                        f"Operation failed after {max_retries + 1} attempts: {e}"
                    )

        raise last_exception  # type: ignore[misc]

    def quarantine_record(
        self, record: dict[str, Any], rule_id: str, reason: str
    ) -> None:
        """Isolate a failed record to the quarantine Parquet file.

        Appends the record with rule_id, reason, and quarantine_timestamp to the
        quarantine file (staging/quarantine.parquet). Creates the file if it
        does not exist. Uses the retry policy for transient I/O errors during
        write operations.

        Fields stored per Requirement 10.3:
        - rule_id: Identifier of the quality rule that caused quarantine.
        - reason: Human-readable explanation of why the record was quarantined.
        - quarantine_timestamp: ISO-8601 UTC timestamp of when the record was quarantined.

        Args:
            record: Dictionary representing the failed record data.
            rule_id: Identifier of the quality rule that caused quarantine.
            reason: Human-readable explanation of why the record was quarantined.
        """
        quarantine_path = self.output_dir / self._QUARANTINE_RELATIVE
        quarantine_path.parent.mkdir(parents=True, exist_ok=True)

        # Build quarantine entry with required fields (Requirement 10.3)
        quarantine_entry = {
            "quarantine_timestamp": datetime.now(timezone.utc).isoformat(),
            "rule_id": rule_id,
            "reason": reason,
            "record_data": json.dumps(record, default=str),
        }

        # Create DataFrame for the new entry
        new_row = pl.DataFrame([quarantine_entry])

        @retry_policy(max_retries=3, base_delay=2.0, max_delay=30.0, jitter=0.5)
        def _write_quarantine() -> None:
            """Write quarantine entry with retry for transient I/O errors."""
            if quarantine_path.exists():
                existing = pl.read_parquet(quarantine_path)
                combined = pl.concat([existing, new_row], how="diagonal_relaxed")
            else:
                combined = new_row
            combined.write_parquet(quarantine_path, compression="snappy")

        _write_quarantine()

    def validate_records(self, df: pl.DataFrame) -> tuple[pl.DataFrame, int]:
        """Validate records against PQRSchema and quarantine failures.

        Validates each record against the PQR schema. Records that fail
        validation are sent directly to quarantine (no retry — validation
        errors are non-transient per Requirement 10.4). Records that pass
        are returned for downstream processing.

        Args:
            df: DataFrame to validate.

        Returns:
            Tuple of (valid_df, quarantined_count) where valid_df contains only
            records that passed validation, and quarantined_count is the number
            of records sent to quarantine.
        """
        quarantined_count = 0

        try:
            # Attempt full schema validation
            PQRSchema.validate(df)  # type: ignore[arg-type]
            # If no exception, all records are valid
            return df, 0
        except Exception as schema_error:
            # Schema validation failed — identify and quarantine invalid records
            logger.warning(f"Schema validation found issues: {schema_error}")

        # Row-by-row validation for granular quarantine
        valid_indices: list[int] = []

        for i in range(df.height):
            row_df = df.slice(i, 1)
            try:
                PQRSchema.validate(row_df)  # type: ignore[arg-type]
                valid_indices.append(i)
            except Exception as e:
                # Validation errors go directly to quarantine (no retry - Requirement 10.4)
                record_data = row_df.to_dicts()[0]
                rule_id = "SCHEMA_VALIDATION"
                reason = str(e)[:500]  # Truncate long error messages
                try:
                    self.quarantine_record(record_data, rule_id, reason)
                    quarantined_count += 1
                    logger.info(
                        f"Record {i} quarantined: rule_id={rule_id}, reason={reason[:100]}..."
                    )
                except Exception as quarantine_err:
                    # If quarantine write itself fails after retries, log and count
                    logger.error(f"Failed to quarantine record {i}: {quarantine_err}")
                    quarantined_count += 1

        if valid_indices:
            valid_df = df[valid_indices]
        else:
            valid_df = df.clear()

        return valid_df, quarantined_count

    def update_control_table(self, batch: IngestionBatch, stages_completed: list[str] | None = None) -> None:
        """Append or update batch information in the JSON control table.

        Records the batch with the enhanced schema including per-stage tracking:
        file_hash, file_name, status, stages_completed, records_processed,
        started_at, and completed_at.

        The control table uses the schema:
        { "batches": [{ "file_hash": str, "file_name": str, "status": str,
          "stages_completed": list[str], "records_processed": int,
          "started_at": str, "completed_at": str|null, ... }] }

        Args:
            batch: IngestionBatch instance with batch metrics.
            stages_completed: List of stage names completed so far.
        """
        control_table_path = self.output_dir / self._CONTROL_TABLE_RELATIVE
        control_table_path.parent.mkdir(parents=True, exist_ok=True)

        # Load existing control table
        control_data: dict[str, Any] = {"batches": []}
        if control_table_path.exists():
            try:
                with open(control_table_path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                # Support legacy format (plain list) and new format ({"batches": [...]})
                if isinstance(raw, list):
                    control_data = {"batches": raw}
                elif isinstance(raw, dict) and "batches" in raw:
                    control_data = raw
                else:
                    control_data = {"batches": []}
            except (json.JSONDecodeError, OSError):
                control_data = {"batches": []}

        # Build the enhanced batch record
        completed_at = (
            batch.ingestion_timestamp.isoformat()
            if batch.status == BatchStatus.COMPLETED
            else None
        )
        # Calculate started_at from ingestion_timestamp
        started_at = batch.ingestion_timestamp.isoformat()

        batch_record: dict[str, Any] = {
            "batch_id": batch.batch_id,
            "file_hash": batch.source_file_hash,
            "file_name": batch.source_file_path.name if batch.source_file_path else "",
            "status": batch.status.value,
            "stages_completed": stages_completed or [],
            "records_processed": batch.records_ingested,
            "started_at": started_at,
            "completed_at": completed_at,
            # Preserve extended fields for backward compatibility
            "source_file_path": str(batch.source_file_path),
            "source_file_hash": batch.source_file_hash,
            "records_ingested": batch.records_ingested,
            "records_validated": batch.records_validated,
            "records_quarantined": batch.records_quarantined,
            "records_rejected": batch.records_rejected,
            "processing_duration_seconds": batch.processing_duration_seconds,
        }

        # Check if this batch_id already exists (update in place)
        existing_idx = None
        for idx, entry in enumerate(control_data["batches"]):
            if entry.get("batch_id") == batch.batch_id:
                existing_idx = idx
                break

        if existing_idx is not None:
            control_data["batches"][existing_idx] = batch_record
        else:
            control_data["batches"].append(batch_record)

        # Write back the control table
        with open(control_table_path, "w", encoding="utf-8") as f:
            json.dump(control_data, f, indent=2, ensure_ascii=False)

    def run(self, source: Path | str, config: PipelineConfig | None = None) -> PipelineResult:
        """Execute the full data pipeline: ingest → profile → validate → enrich → serve.

        Enforces sequential stage execution (Requirement 10.2):
        1. ingest: Read Excel via ExcelIngestionAdapter
        2. profile: Type inference, null stats, outliers, duplicates, dates, similarity
        3. validate: Generate quality report
        4. enrich: Compute quality score
        5. serve: Store curated data as Parquet and update control table

        Idempotency (Requirement 10.1):
        - Computes SHA-256 hash of input file at the start
        - Checks control table for matching hash with status "completed"
        - If found: skips reprocessing and returns existing result
        - If not found or status != "completed": proceeds with pipeline

        Control table is updated after each stage completion for observability
        (Requirement 10.6, 10.7).

        Args:
            source: Path to the source Excel file.
            config: Optional PipelineConfig. If None, defaults are used.

        Returns:
            PipelineResult with success status, batch info, reports, and errors.
        """
        source_path = Path(source)
        start_time = time.time()
        errors: list[str] = []
        stages_completed: list[str] = []

        if config is None:
            config = PipelineConfig(source_path=source_path, output_dir=self.output_dir)

        # Initialize batch tracking
        batch = IngestionBatch(
            batch_id=str(uuid.uuid4()),
            ingestion_timestamp=datetime.now(timezone.utc),
            source_file_path=source_path,
            source_file_hash="",
            status=BatchStatus.IN_PROGRESS,
        )

        try:
            # --- Pre-processing: Compute file hash and check idempotency ---
            logger.info(f"Computing SHA-256 hash for '{source_path}'...")
            file_hash = self.compute_file_hash(source_path)
            batch.source_file_hash = file_hash

            # Idempotency check (Requirement 10.1): skip if already completed
            if not config.force_reprocess and self.is_already_processed(file_hash):
                elapsed = time.time() - start_time
                batch.processing_duration_seconds = round(elapsed, 2)
                batch.status = BatchStatus.COMPLETED
                logger.info(
                    f"File '{source_path.name}' already processed "
                    f"(hash: {file_hash[:12]}...). Skipping reprocessing."
                )
                return PipelineResult(
                    success=True,
                    batch=batch,
                    quality_report=None,
                    quality_score=None,
                    errors=[],
                    message=(
                        f"File '{source_path.name}' already processed "
                        f"(hash: {file_hash[:12]}...). Skipping."
                    ),
                )

            # Register initial "running" entry in control table
            self.update_control_table(batch, stages_completed)

            # --- Stage 1: INGEST — Read Excel via adapter ---
            logger.info(f"[Stage: ingest] Ingesting '{source_path.name}'...")

            @retry_policy(max_retries=3, base_delay=2.0, max_delay=30.0, jitter=0.5)
            def _ingest_file() -> dict:
                return self._adapter.read(source_path)

            sheets = _ingest_file()

            if not sheets:
                raise ValueError(
                    f"No data sheets found in '{source_path.name}'."
                )

            # Combine all sheets into a single DataFrame for processing
            dfs = list(sheets.values())
            if len(dfs) == 1:
                df = dfs[0]
            else:
                try:
                    df = pl.concat(dfs, how="diagonal_relaxed")
                except Exception:
                    df = max(dfs, key=lambda d: d.height)

            batch.records_ingested = df.height
            stages_completed.append("ingest")
            self.update_control_table(batch, stages_completed)
            logger.info(
                f"[Stage: ingest] Completed. {df.height} records from {len(sheets)} sheet(s)."
            )

            # --- Stage 2: PROFILE — Data profiling ---
            logger.info("[Stage: profile] Profiling data...")
            quality_report = self._report_generator.generate_report(df)
            stages_completed.append("profile")
            self.update_control_table(batch, stages_completed)
            logger.info("[Stage: profile] Completed.")

            # --- Stage 3: VALIDATE — Schema validation with quarantine ---
            logger.info("[Stage: validate] Validating data...")
            # Validate records against PQRSchema; quarantine failures (Requirement 10.3, 10.4)
            valid_df, quarantined_count = self.validate_records(df)
            batch.records_validated = valid_df.height
            batch.records_quarantined = quarantined_count
            # Update df to only include valid records for downstream stages
            df = valid_df
            stages_completed.append("validate")
            self.update_control_table(batch, stages_completed)
            logger.info(
                f"[Stage: validate] Completed. "
                f"{batch.records_validated} valid, {quarantined_count} quarantined."
            )

            # --- Stage 4: ENRICH — Compute quality score ---
            logger.info("[Stage: enrich] Computing quality score...")
            quality_score, violations = self._score_computer.compute(df)
            stages_completed.append("enrich")
            self.update_control_table(batch, stages_completed)
            logger.info("[Stage: enrich] Completed.")

            # --- Stage 5: SERVE — Store curated data and finalize ---
            logger.info("[Stage: serve] Storing curated data...")
            curated_dir = config.output_dir / self._CURATED_RELATIVE
            curated_dir.mkdir(parents=True, exist_ok=True)

            curated_filename = f"{source_path.stem}_curated.parquet"
            curated_path = curated_dir / curated_filename

            @retry_policy(max_retries=3, base_delay=2.0, max_delay=30.0, jitter=0.5)
            def _write_curated() -> None:
                """Write curated Parquet with snappy compression (Requirement 10.5)."""
                df.write_parquet(curated_path, compression="snappy")

            _write_curated()
            stages_completed.append("serve")
            logger.info(f"[Stage: serve] Curated data written to '{curated_path}'.")

            # --- Finalize batch ---
            elapsed = time.time() - start_time
            batch.processing_duration_seconds = round(elapsed, 2)
            batch.status = BatchStatus.COMPLETED

            self.update_control_table(batch, stages_completed)
            logger.info(
                f"Pipeline completed in {elapsed:.2f}s. "
                f"Records: {batch.records_ingested} ingested, "
                f"{batch.records_validated} validated, "
                f"{batch.records_quarantined} quarantined. "
                f"Stages completed: {stages_completed}"
            )

            return PipelineResult(
                success=True,
                batch=batch,
                quality_report=quality_report,
                quality_score=quality_score,
                errors=errors,
                message=(
                    f"Pipeline completed successfully. "
                    f"Processed {batch.records_ingested} records in {elapsed:.2f}s. "
                    f"Quality score: {quality_score.composite_score:.1f}/100."
                ),
            )

        except FileNotFoundError as e:
            elapsed = time.time() - start_time
            batch.processing_duration_seconds = round(elapsed, 2)
            batch.status = BatchStatus.FAILED
            error_msg = f"Source file not found: {e}"
            errors.append(error_msg)
            logger.error(error_msg)
            self.update_control_table(batch, stages_completed)

            return PipelineResult(
                success=False,
                batch=batch,
                quality_report=None,
                quality_score=None,
                errors=errors,
                message=error_msg,
            )

        except Exception as e:
            elapsed = time.time() - start_time
            batch.processing_duration_seconds = round(elapsed, 2)
            batch.status = BatchStatus.FAILED
            error_msg = f"Pipeline failed: {e}"
            errors.append(error_msg)
            logger.error(error_msg, exc_info=True)
            self.update_control_table(batch, stages_completed)

            return PipelineResult(
                success=False,
                batch=batch,
                quality_report=None,
                quality_score=None,
                errors=errors,
                message=error_msg,
            )
