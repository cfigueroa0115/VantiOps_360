"""Filter parameter handling for the PQR Analytics API.

Provides a FastAPI-compatible dependency that parses filter query parameters
and builds DuckDB WHERE clauses for aggregation queries.

Requirements: 7.1, 7.2
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from fastapi import Query


@dataclass
class FilterParams:
    """Parsed filter parameters from query string.

    All filters use AND logic when combined.
    """

    date_start: Optional[str] = None
    date_end: Optional[str] = None
    companies: list[str] = field(default_factory=list)
    causes: list[str] = field(default_factory=list)
    channels: list[str] = field(default_factory=list)
    statuses: list[str] = field(default_factory=list)
    results: list[str] = field(default_factory=list)
    responsible_units: list[str] = field(default_factory=list)
    time_min: Optional[float] = None
    time_max: Optional[float] = None


def parse_filters(
    date_start: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_end: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    companies: Optional[str] = Query(None, description="Comma-separated company names"),
    causes: Optional[str] = Query(None, description="Comma-separated cause values"),
    channels: Optional[str] = Query(None, description="Comma-separated channels"),
    statuses: Optional[str] = Query(None, description="Comma-separated statuses"),
    results: Optional[str] = Query(None, description="Comma-separated results"),
    responsible_units: Optional[str] = Query(None, description="Comma-separated units"),
    time_min: Optional[float] = Query(None, description="Min management time in days"),
    time_max: Optional[float] = Query(None, description="Max management time in days"),
) -> FilterParams:
    """FastAPI dependency that parses filter query parameters."""
    return FilterParams(
        date_start=date_start,
        date_end=date_end,
        companies=_split_csv(companies),
        causes=_split_csv(causes),
        channels=_split_csv(channels),
        statuses=_split_csv(statuses),
        results=_split_csv(results),
        responsible_units=_split_csv(responsible_units),
        time_min=time_min,
        time_max=time_max,
    )


def _split_csv(value: Optional[str]) -> list[str]:
    """Split a comma-separated string into a trimmed list."""
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


def build_where_clause(filters: FilterParams) -> tuple[str, list]:
    """Build a DuckDB-compatible WHERE clause from filter params.

    Returns a tuple of (clause_string, parameters) for safe parameterized queries.
    The clause_string includes 'WHERE' prefix only if conditions exist.
    """
    conditions: list[str] = []
    params: list = []

    if filters.date_start:
        conditions.append("fecha_creacion >= ?")
        params.append(filters.date_start)

    if filters.date_end:
        conditions.append("fecha_creacion <= ?")
        params.append(filters.date_end)

    if filters.companies:
        placeholders = ", ".join(["?"] * len(filters.companies))
        conditions.append(f"empresa IN ({placeholders})")
        params.extend(filters.companies)

    if filters.causes:
        placeholders = ", ".join(["?"] * len(filters.causes))
        conditions.append(f"causa IN ({placeholders})")
        params.extend(filters.causes)

    if filters.channels:
        placeholders = ", ".join(["?"] * len(filters.channels))
        conditions.append(f"canal_atencion IN ({placeholders})")
        params.extend(filters.channels)

    if filters.statuses:
        placeholders = ", ".join(["?"] * len(filters.statuses))
        conditions.append(f"estado IN ({placeholders})")
        params.extend(filters.statuses)

    if filters.results:
        placeholders = ", ".join(["?"] * len(filters.results))
        conditions.append(f"resultado IN ({placeholders})")
        params.extend(filters.results)

    if filters.responsible_units:
        placeholders = ", ".join(["?"] * len(filters.responsible_units))
        conditions.append(f"unidad_responsable IN ({placeholders})")
        params.extend(filters.responsible_units)

    if filters.time_min is not None:
        conditions.append("tiempo_gestion_dias >= ?")
        params.append(filters.time_min)

    if filters.time_max is not None:
        conditions.append("tiempo_gestion_dias <= ?")
        params.append(filters.time_max)

    if not conditions:
        return "", []

    return "WHERE " + " AND ".join(conditions), params
