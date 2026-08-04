"""
Property-based tests for retry policy bounds and classification (Property 7).

**Validates: Requirements 37.1, 37.2**

Uses Hypothesis to verify:
- P7a: compute_delay() always returns a value in [0, max_delay + jitter]
- P7b: Non-transient errors are classified correctly (is_transient_error returns False)
- P7c: Transient errors are classified correctly (is_transient_error returns True)
- P7d: Delay grows exponentially but never exceeds max_delay + jitter
"""

import hypothesis.strategies as st
from hypothesis import assume, given, settings

from core.retry import (
    NonTransientHTTPError,
    TransientHTTPError,
    compute_delay,
    is_transient_error,
)

# --- Strategies ---

# Attempt numbers: 0 to 10 (typical retry range)
attempts = st.integers(min_value=0, max_value=10)

# Base delay: positive floats, reasonable range
base_delays = st.floats(min_value=0.1, max_value=10.0, allow_nan=False, allow_infinity=False)

# Max delay: positive floats, must be reasonable
max_delays = st.floats(min_value=1.0, max_value=60.0, allow_nan=False, allow_infinity=False)

# Jitter: non-negative floats, reasonable range
jitters = st.floats(min_value=0.0, max_value=5.0, allow_nan=False, allow_infinity=False)

# Non-transient error instances
non_transient_errors = st.one_of(
    st.just(ValueError("bad value")),
    st.just(TypeError("wrong type")),
    st.just(PermissionError("access denied")),
    st.builds(
        NonTransientHTTPError,
        status_code=st.sampled_from([400, 401, 403, 404, 422]),
        message=st.text(min_size=1, max_size=20),
    ),
)

# Transient error instances
transient_errors = st.one_of(
    st.just(ConnectionError("connection refused")),
    st.just(TimeoutError("timed out")),
    st.just(IOError("io failure")),
    st.just(OSError("network error")),
    st.builds(
        TransientHTTPError,
        status_code=st.sampled_from([500, 502, 503, 429]),
        message=st.text(min_size=1, max_size=20),
    ),
)


# --- Property Tests ---


class TestRetryDelayBounds:
    """P7a: For any attempt, base_delay, max_delay, jitter.

    compute_delay() returns a value in [0, max_delay + jitter].
    """

    @given(attempt=attempts, base_delay=base_delays, max_delay=max_delays, jitter=jitters)
    @settings(max_examples=200)
    def test_delay_within_bounds(
        self, attempt: int, base_delay: float, max_delay: float, jitter: float
    ):
        """compute_delay always returns a value in [0, max_delay + jitter]."""
        assume(base_delay <= max_delay)

        delay = compute_delay(attempt, base_delay, max_delay, jitter)

        assert delay >= 0.0, f"Delay {delay} is negative"
        assert (
            delay <= max_delay + jitter
        ), (
            f"Delay {delay} exceeds max_delay ({max_delay}) + "
            f"jitter ({jitter}) = {max_delay + jitter}"
        )


class TestNonTransientErrorClassification:
    """P7b: For any non-transient error: is_transient_error() returns False."""

    @given(error=non_transient_errors)
    @settings(max_examples=100)
    def test_non_transient_errors_classified_correctly(self, error: BaseException):
        """Non-transient errors must never be classified as transient (zero retries enforced)."""
        result = is_transient_error(error)

        assert (
            result is False
        ), (
            f"Error {type(error).__name__}('{error}') was classified "
            f"as transient but should NOT be retried"
        )


class TestTransientErrorClassification:
    """P7c: For any transient error: is_transient_error() returns True."""

    @given(error=transient_errors)
    @settings(max_examples=100)
    def test_transient_errors_classified_correctly(self, error: BaseException):
        """Transient errors must be classified as transient (eligible for retry)."""
        result = is_transient_error(error)

        assert (
            result is True
        ), (
            f"Error {type(error).__name__}('{error}') was NOT classified "
            f"as transient but SHOULD be retried"
        )


class TestExponentialGrowthWithCap:
    """P7d: The delay grows exponentially but never exceeds max_delay + jitter."""

    @given(base_delay=base_delays, max_delay=max_delays, jitter=jitters)
    @settings(max_examples=100)
    def test_delay_monotonically_bounded(self, base_delay: float, max_delay: float, jitter: float):
        """Over increasing attempts, delay is always bounded by max_delay + jitter."""
        assume(base_delay <= max_delay)

        upper_bound = max_delay + jitter

        for attempt in range(11):
            delay = compute_delay(attempt, base_delay, max_delay, jitter)
            assert (
                delay <= upper_bound
            ), f"At attempt {attempt}, delay {delay} exceeds upper bound {upper_bound}"
            assert delay >= 0.0, f"At attempt {attempt}, delay {delay} is negative"

    @given(base_delay=base_delays, max_delay=max_delays)
    @settings(max_examples=100)
    def test_exponential_base_grows_until_cap(self, base_delay: float, max_delay: float):
        """The exponential base (without jitter) grows with attempt until it hits max_delay."""
        assume(base_delay <= max_delay)

        # With zero jitter, verify the exponential growth pattern
        previous_delay = None
        for attempt in range(11):
            delay = compute_delay(attempt, base_delay, max_delay, jitter=0.0)

            # Expected: min(base_delay * 2^attempt, max_delay)
            expected_base = min(base_delay * (2**attempt), max_delay)
            assert (
                delay == expected_base
            ), f"At attempt {attempt}, delay {delay} != expected {expected_base}"

            # Verify monotonic growth until cap
            if previous_delay is not None:
                assert (
                    delay >= previous_delay
                ), f"Delay decreased from {previous_delay} to {delay} at attempt {attempt}"
            previous_delay = delay
