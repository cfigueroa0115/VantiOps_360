"""Production seed guard — prevents destructive database operations in production environments.

This module provides a pure function that can be tested without triggering
any actual database operations or imports of database-related modules.
"""

import os


def assert_safe_seed_environment(env: str | None = None) -> None:
    """Refuse to run destructive seed operations in production.

    Args:
        env: Explicit environment value. If None, checks VERCEL_ENV, APP_ENV,
             and ENVIRONMENT environment variables in that order.

    Raises:
        RuntimeError: If the detected environment is 'production' or 'prod'.
    """
    if env is None:
        env = (
            os.getenv("VERCEL_ENV")
            or os.getenv("APP_ENV")
            or os.getenv("ENVIRONMENT")
            or ""
        )

    env_lower = env.lower().strip()

    if env_lower in {"production", "prod"}:
        raise RuntimeError(
            "DESTRUCTIVE SEED OPERATION REFUSED: "
            "Cannot execute DROP TABLE in production environment. "
            f"Detected environment: {env_lower}"
        )
