"""
Centralized retry policy per REQ-37.

Provides a `retry_policy` decorator for transient error handling
with exponential backoff, jitter, and max delay cap.

Configuration:
  - max_retries: 3 (default)
  - base_delay: 2.0 seconds (default)
  - max_delay: 30.0 seconds (default)
  - jitter: ±0.5 seconds (default)

Transient errors (will retry):
  - ConnectionError, TimeoutError, IOError
  - OSError (network-level)
  - HTTP 5xx (via TransientHTTPError)
  - HTTP 429 (rate-limited)

Non-transient errors (zero retries, propagate immediately):
  - ValueError, TypeError (validation errors)
  - PermissionError (auth/authorization)
  - HTTP 4xx (except 429)
  - Any error not in the transient classification
"""

import random
import time
import logging
from functools import wraps
from typing import Callable, TypeVar, Any

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


class TransientHTTPError(Exception):
    """Represents a transient HTTP error (5xx, 429) that should be retried."""

    def __init__(self, status_code: int, message: str = ""):
        self.status_code = status_code
        self.message = message
        super().__init__(f"HTTP {status_code}: {message}")


class NonTransientHTTPError(Exception):
    """Represents a non-transient HTTP error (4xx except 429) that should NOT be retried."""

    def __init__(self, status_code: int, message: str = ""):
        self.status_code = status_code
        self.message = message
        super().__init__(f"HTTP {status_code}: {message}")


# Transient error types that qualify for retry
TRANSIENT_ERRORS: tuple[type[BaseException], ...] = (
    ConnectionError,
    TimeoutError,
    IOError,
    OSError,
    TransientHTTPError,
)

# Non-transient error types that must NOT be retried (zero retries enforced)
NON_TRANSIENT_ERRORS: tuple[type[BaseException], ...] = (
    ValueError,
    TypeError,
    PermissionError,
    NonTransientHTTPError,
)


def is_transient_error(error: BaseException) -> bool:
    """Classify whether an error is transient and eligible for retry.

    Transient errors:
      - Network timeouts, connection refused, I/O errors
      - HTTP 5xx (server errors)
      - HTTP 429 (rate limited)

    Non-transient errors:
      - HTTP 4xx (except 429): 400, 401, 403, 404, 422
      - Validation errors (ValueError, TypeError)
      - Authorization errors (PermissionError)
    """
    if isinstance(error, NON_TRANSIENT_ERRORS):
        return False
    if isinstance(error, TRANSIENT_ERRORS):
        return True
    return False


def compute_delay(attempt: int, base_delay: float, max_delay: float, jitter: float) -> float:
    """Compute the delay for a given retry attempt.

    Uses exponential backoff with jitter:
      delay = min(base_delay * 2^attempt, max_delay) + random(-jitter, +jitter)

    The final delay is clamped to a minimum of 0.
    """
    exponential = base_delay * (2 ** attempt)
    capped = min(exponential, max_delay)
    jittered = capped + random.uniform(-jitter, jitter)
    return max(0.0, jittered)


def retry_policy(
    max_retries: int = 3,
    base_delay: float = 2.0,
    max_delay: float = 30.0,
    jitter: float = 0.5,
    sleep_func: Callable[[float], None] | None = None,
) -> Callable[[F], F]:
    """Centralized retry policy decorator per REQ-37.

    Retries the decorated function on transient errors with exponential backoff.
    Non-transient errors propagate immediately with zero retries.

    Args:
        max_retries: Maximum number of retry attempts (default: 3).
        base_delay: Base delay in seconds for exponential backoff (default: 2.0).
        max_delay: Maximum delay cap in seconds (default: 30.0).
        jitter: Random jitter in seconds applied ±jitter (default: 0.5).
        sleep_func: Optional sleep function for testing (default: time.sleep).

    Returns:
        Decorated function with retry behavior.

    Example:
        @retry_policy()
        def fetch_data():
            ...

        @retry_policy(max_retries=5, base_delay=1.0)
        def connect_to_db():
            ...
    """
    _sleep = sleep_func or time.sleep

    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_error: BaseException | None = None

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except BaseException as e:
                    # Non-transient errors: propagate immediately, zero retries
                    if not is_transient_error(e):
                        raise

                    last_error = e

                    # If this was the last attempt, propagate the error
                    if attempt == max_retries:
                        logger.error(
                            "All %d retries exhausted for %s. Last error: %s",
                            max_retries,
                            func.__name__,
                            str(e),
                        )
                        raise

                    # Compute delay and wait before next attempt
                    delay = compute_delay(attempt, base_delay, max_delay, jitter)
                    logger.warning(
                        "Retry %d/%d for %s after %.2fs. Error: %s",
                        attempt + 1,
                        max_retries,
                        func.__name__,
                        delay,
                        str(e),
                    )
                    _sleep(delay)

            # Should not reach here, but safety net
            if last_error:
                raise last_error
            raise RuntimeError("Unexpected retry loop exit")  # pragma: no cover

        return wrapper  # type: ignore[return-value]

    return decorator
