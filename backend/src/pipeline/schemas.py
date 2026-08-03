"""Pandera schema contracts for the curated data layer.

Defines the PQRSchema using pandera-polars DataFrameModel for enforcing
data contracts on PQR records entering and exiting pipeline stages.

Requirements: 14.4
"""

from __future__ import annotations

from datetime import date

import pandera.polars as pa


class PQRSchema(pa.DataFrameModel):
    """Pandera schema contract for the PQR curated layer.

    Validates structure, types, and domain constraints for PQR records
    that have passed through the full pipeline and are ready for
    analytical consumption.

    Fields:
        id_pqr: Unique PQR identifier (non-nullable, unique).
        fecha_creacion: Creation date (non-nullable, >= 2020-01-01).
        fecha_cierre: Closure date (nullable for open/in-process PQRs).
        estado: Status (cerrado, en_proceso, abierto).
        causa: Root cause category (non-nullable).
        canal_atencion: Attention channel (non-nullable).
        empresa: Company name (non-nullable).
        resultado: Resolution result (nullable).
        unidad_responsable: Responsible organizational unit (nullable).
        marcacion: Classification marking (nullable).
        motivo_cierre: Closure reason (nullable).
        tiempo_gestion_dias: Management time in days (>= 0, nullable).
        tipo_pqr: PQR type (peticion, queja, reclamo).
    """

    id_pqr: int = pa.Field(unique=True, nullable=False)
    fecha_creacion: date = pa.Field(nullable=False, ge=date(2020, 1, 1))
    fecha_cierre: date = pa.Field(nullable=True)
    estado: str = pa.Field(isin=["cerrado", "en_proceso", "abierto"], nullable=False)
    causa: str = pa.Field(nullable=False)
    canal_atencion: str = pa.Field(nullable=False)
    empresa: str = pa.Field(nullable=False)
    resultado: str = pa.Field(nullable=True)
    unidad_responsable: str = pa.Field(nullable=True)
    marcacion: str = pa.Field(nullable=True)
    motivo_cierre: str = pa.Field(nullable=True)
    tiempo_gestion_dias: float = pa.Field(ge=0, nullable=True)
    tipo_pqr: str = pa.Field(isin=["peticion", "queja", "reclamo"], nullable=False)

    class Config(pa.DataFrameModel.Config):
        """Schema configuration."""

        strict = False
        coerce = True
