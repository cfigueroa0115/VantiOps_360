"""Migration module for 600-record master PQR migration.

Provides the master migration pipeline that reads curated PQR data,
profiles, cleans, validates, loads to Neon PostgreSQL via UPSERT,
reconciles, and generates post-migration reports.

Requirements: 19.1, 19.2, 19.5, 19.6, 19.7
"""
