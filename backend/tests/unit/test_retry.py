"""Unit tests for the centralized retry policy (REQ-37)."""

import pytest

from core.retry import (
    NonTransientHTTPError,
    TransientHTTPError,
    compute_delay,
    is_transient_error,
    retry_policy,
)


class TestErrorClassification:
    """Tests for transient vs non-transient error classification."""

    def test_connection_error_is_transient(self):
        assert is_transient_error(ConnectionError("connection refused")) is True

    def test_timeout_error_is_transient(self):
        assert is_transient_error(TimeoutError("timed out")) is True

    def test_io_error_is_transient(self):
        assert is_transient_error(IOError("I/O failure")) is True

    def test_os_error_is_transient(self):
        assert is_transient_error(OSError("network unreachable")) is True

    def test_transient_http_error_is_transient(self):
        assert is_transient_error(TransientHTTPError(503, "Service Unavailable")) is True
        assert is_transient_error(TransientHTTPError(500, "Internal Server Error")) is True
        assert is_transient_error(TransientHTTPError(429, "Rate Limited")) is True

    def test_value_error_is_not_transient(self):
        assert is_transient_error(ValueError("invalid input")) is False

    def test_type_error_is_not_transient(self):
        assert is_transient_error(TypeError("wrong type")) is False

    def test_permission_error_is_not_transient(self):
        assert is_transient_error(PermissionError("forbidden")) is False

    def test_non_transient_http_error_is_not_transient(self):
        assert is_transient_error(NonTransientHTTPError(400, "Bad Request")) is False
        assert is_transient_error(NonTransientHTTPError(401, "Unauthorized")) is False
        assert is_transient_error(NonTransientHTTPError(403, "Forbidden")) is False
        assert is_transient_error(NonTransientHTTPError(404, "Not Found")) is False

    def test_generic_exception_is_not_transient(self):
        assert is_transient_error(Exception("something")) is False

    def test_runtime_error_is_not_transient(self):
        assert is_transient_error(RuntimeError("runtime issue")) is False


class TestComputeDelay:
    """Tests for delay computation with exponential backoff and jitter."""

    def test_attempt_zero_base_delay(self):
        # Attempt 0: base_delay * 2^0 = 2.0 ± 0.5
        delay = compute_delay(attempt=0, base_delay=2.0, max_delay=30.0, jitter=0.5)
        assert 1.5 <= delay <= 2.5

    def test_attempt_one_doubles(self):
        # Attempt 1: base_delay * 2^1 = 4.0 ± 0.5
        delay = compute_delay(attempt=1, base_delay=2.0, max_delay=30.0, jitter=0.5)
        assert 3.5 <= delay <= 4.5

    def test_attempt_two_quadruples(self):
        # Attempt 2: base_delay * 2^2 = 8.0 ± 0.5
        delay = compute_delay(attempt=2, base_delay=2.0, max_delay=30.0, jitter=0.5)
        assert 7.5 <= delay <= 8.5

    def test_max_delay_caps_exponential(self):
        # Attempt 10: base_delay * 2^10 = 2048, capped at 30.0 ± 0.5
        delay = compute_delay(attempt=10, base_delay=2.0, max_delay=30.0, jitter=0.5)
        assert 29.5 <= delay <= 30.5

    def test_delay_never_negative(self):
        # Even with large negative jitter, delay should not be negative
        for _ in range(100):
            delay = compute_delay(attempt=0, base_delay=0.1, max_delay=30.0, jitter=0.5)
            assert delay >= 0.0

    def test_zero_jitter_gives_exact_delay(self):
        delay = compute_delay(attempt=0, base_delay=2.0, max_delay=30.0, jitter=0.0)
        assert delay == 2.0


class TestRetryPolicy:
    """Tests for the retry_policy decorator."""

    def test_success_on_first_attempt(self):
        call_count = 0

        @retry_policy(sleep_func=lambda _: None)
        def succeed():
            nonlocal call_count
            call_count += 1
            return "ok"

        assert succeed() == "ok"
        assert call_count == 1

    def test_retries_on_transient_error_then_succeeds(self):
        call_count = 0

        @retry_policy(sleep_func=lambda _: None)
        def fail_twice():
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                raise ConnectionError("connection refused")
            return "ok"

        assert fail_twice() == "ok"
        assert call_count == 3

    def test_exhausts_retries_and_raises(self):
        call_count = 0

        @retry_policy(max_retries=3, sleep_func=lambda _: None)
        def always_fail():
            nonlocal call_count
            call_count += 1
            raise TimeoutError("timed out")

        with pytest.raises(TimeoutError, match="timed out"):
            always_fail()

        # 1 initial + 3 retries = 4 total attempts
        assert call_count == 4

    def test_non_transient_error_propagates_immediately(self):
        call_count = 0

        @retry_policy(sleep_func=lambda _: None)
        def validation_error():
            nonlocal call_count
            call_count += 1
            raise ValueError("invalid input")

        with pytest.raises(ValueError, match="invalid input"):
            validation_error()

        # Zero retries for non-transient errors
        assert call_count == 1

    def test_permission_error_propagates_immediately(self):
        call_count = 0

        @retry_policy(sleep_func=lambda _: None)
        def auth_error():
            nonlocal call_count
            call_count += 1
            raise PermissionError("forbidden")

        with pytest.raises(PermissionError, match="forbidden"):
            auth_error()

        assert call_count == 1

    def test_non_transient_http_error_propagates_immediately(self):
        call_count = 0

        @retry_policy(sleep_func=lambda _: None)
        def http_400():
            nonlocal call_count
            call_count += 1
            raise NonTransientHTTPError(400, "Bad Request")

        with pytest.raises(NonTransientHTTPError):
            http_400()

        assert call_count == 1

    def test_transient_http_error_retries(self):
        call_count = 0

        @retry_policy(max_retries=2, sleep_func=lambda _: None)
        def http_503():
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                raise TransientHTTPError(503, "Service Unavailable")
            return "recovered"

        assert http_503() == "recovered"
        assert call_count == 3

    def test_custom_config(self):
        call_count = 0

        @retry_policy(max_retries=5, base_delay=1.0, max_delay=10.0, jitter=0.0, sleep_func=lambda _: None)
        def fail_four_times():
            nonlocal call_count
            call_count += 1
            if call_count <= 4:
                raise IOError("disk failure")
            return "ok"

        assert fail_four_times() == "ok"
        assert call_count == 5

    def test_sleep_func_receives_correct_delays(self):
        delays = []

        @retry_policy(
            max_retries=3,
            base_delay=2.0,
            max_delay=30.0,
            jitter=0.0,
            sleep_func=lambda d: delays.append(d),
        )
        def always_timeout():
            raise TimeoutError("timeout")

        with pytest.raises(TimeoutError):
            always_timeout()

        # With jitter=0: delays should be exactly 2, 4, 8
        assert delays == [2.0, 4.0, 8.0]

    def test_preserves_function_name(self):
        @retry_policy(sleep_func=lambda _: None)
        def my_function():
            return 42

        assert my_function.__name__ == "my_function"

    def test_preserves_function_return_value(self):
        @retry_policy(sleep_func=lambda _: None)
        def returns_dict():
            return {"key": "value", "count": 42}

        result = returns_dict()
        assert result == {"key": "value", "count": 42}
