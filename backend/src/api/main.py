"""FastAPI application creation with CORS middleware.

Start with: uvicorn api.main:app --reload
Run from the backend/src directory.

Requirements: 12.1, 14.2
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="PQR Analytics API",
        description=(
            "REST API serving pre-aggregated PQR analytics to the "
            "Executive Dashboard. All responses contain only aggregated "
            "data — no individual record values (min group size >= 5)."
        ),
        version="0.1.0",
    )

    # CORS middleware for frontend communication
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    return app


app = create_app()
