"""Pipeline control data models.

Defines dataclasses for pipeline orchestration and tracking:
- IngestionBatch: tracks a single pipeline execution batch
- SchemaCatalogEntry: versioned schema catalog with lineage

Requirements: 12.6, 12.10
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path


class BatchStatus(Enum):
    """Status of an ingestion batch."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIALLY_COMPLETED = "partially_completed"


@dataclass(slots=True)
class IngestionBatch:
    """Tracks a single pipeline ingestion batch execution.

    Records all metrics needed for the control table: timestamp, file hash,
    record counts at each stage, and processing duration.

    Attributes:
        batch_id: Unique identifier for this batch run.
        ingestion_timestamp: When the batch processing started.
        source_file_path: Path to the source file being processed.
        source_file_hash: SHA-256 hash of the source file for idempotency.
        records_ingested: Number of records read from source.
        records_validated: Number of records passing validation.
        records_quarantined: Number of records isolated for quality failures.
        records_rejected: Number of records that could not be processed.
        processing_duration_seconds: Total processing time in seconds.
        status: Current status of the batch.
    """

    batch_id: str
    ingestion_timestamp: datetime
    source_file_path: Path
    source_file_hash: str
    records_ingested: int = 0
    records_validated: int = 0
    records_quarantined: int = 0
    records_rejected: int = 0
    processing_duration_seconds: float = 0.0
    status: BatchStatus = BatchStatus.PENDING


@dataclass(slots=True)
class SchemaCatalogEntry:
    """Versioned schema catalog entry with lineage metadata.

    Maintains schema information for each ingested dataset, supporting
    versioning, reproducibility, and lineage tracking.

    Attributes:
        dataset_id: Unique identifier for the dataset.
        version: Schema version string (semver or incremental).
        columns: List of column definitions (name, type, description).
        file_hash: SHA-256 hash of the source file.
        source_file: Path or URI of the original source.
        transformation_steps: Ordered list of transformations applied.
        created_at: Timestamp when this catalog entry was created.
        lineage: Lineage metadata (parent datasets, pipeline run id, etc.).
    """

    dataset_id: str
    version: str
    columns: list[dict[str, str]]
    file_hash: str
    source_file: str
    transformation_steps: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    lineage: dict[str, str | list[str]] = field(default_factory=dict)
