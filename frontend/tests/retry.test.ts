import { describe, it, expect, vi } from "vitest";
import {
  withRetry,
  isTransientError,
  computeDelay,
  TransientHTTPError,
  NonTransientHTTPError,
  DEFAULT_RETRY_CONFIG,
} from "@/lib/server/retry";

describe("retry - error classification", () => {
  it("classifies TransientHTTPError as transient", () => {
    expect(isTransientError(new TransientHTTPError(503, "Service Unavailable"))).toBe(true);
    expect(isTransientError(new TransientHTTPError(500, "Internal Error"))).toBe(true);
    expect(isTransientError(new TransientHTTPError(429, "Rate Limited"))).toBe(true);
  });

  it("classifies NonTransientHTTPError as non-transient", () => {
    expect(isTransientError(new NonTransientHTTPError(400, "Bad Request"))).toBe(false);
    expect(isTransientError(new NonTransientHTTPError(401, "Unauthorized"))).toBe(false);
    expect(isTransientError(new NonTransientHTTPError(403, "Forbidden"))).toBe(false);
    expect(isTransientError(new NonTransientHTTPError(404, "Not Found"))).toBe(false);
  });

  it("classifies errors with statusCode property", () => {
    const transient = Object.assign(new Error("503"), { statusCode: 503 });
    const nonTransient = Object.assign(new Error("400"), { statusCode: 400 });
    expect(isTransientError(transient)).toBe(true);
    expect(isTransientError(nonTransient)).toBe(false);
  });

  it("classifies errors with status property", () => {
    const transient = Object.assign(new Error("500"), { status: 500 });
    const nonTransient = Object.assign(new Error("401"), { status: 401 });
    expect(isTransientError(transient)).toBe(true);
    expect(isTransientError(nonTransient)).toBe(false);
  });

  it("classifies Node.js network error codes as transient", () => {
    const connReset = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });
    const timeout = Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
    const connRefused = Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(isTransientError(connReset)).toBe(true);
    expect(isTransientError(timeout)).toBe(true);
    expect(isTransientError(connRefused)).toBe(true);
  });

  it("classifies fetch TypeError as transient", () => {
    const fetchError = new TypeError("fetch failed");
    expect(isTransientError(fetchError)).toBe(true);
  });

  it("classifies generic errors as non-transient", () => {
    expect(isTransientError(new Error("something"))).toBe(false);
    expect(isTransientError(new RangeError("out of range"))).toBe(false);
  });
});

describe("retry - computeDelay", () => {
  it("computes base delay for attempt 0", () => {
    // With zero jitter to test exact values
    const delay = computeDelay(0, 2000, 30000, 0);
    expect(delay).toBe(2000);
  });

  it("doubles delay per attempt", () => {
    expect(computeDelay(1, 2000, 30000, 0)).toBe(4000);
    expect(computeDelay(2, 2000, 30000, 0)).toBe(8000);
    expect(computeDelay(3, 2000, 30000, 0)).toBe(16000);
  });

  it("caps at maxDelay", () => {
    const delay = computeDelay(10, 2000, 30000, 0);
    expect(delay).toBe(30000);
  });

  it("applies jitter within bounds", () => {
    for (let i = 0; i < 100; i++) {
      const delay = computeDelay(0, 2000, 30000, 500);
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(2500);
    }
  });

  it("never returns negative values", () => {
    for (let i = 0; i < 100; i++) {
      const delay = computeDelay(0, 100, 30000, 500);
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("retry - withRetry", () => {
  const noSleep = async () => {};

  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { sleepFn: noSleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error then succeeds", async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount <= 2) throw new TransientHTTPError(503, "unavailable");
      return "recovered";
    });

    const result = await withRetry(fn, { sleepFn: noSleep });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("exhausts retries and throws last error", async () => {
    const fn = vi.fn(async () => {
      throw new TransientHTTPError(503, "always failing");
    });

    await expect(withRetry(fn, { maxRetries: 3, sleepFn: noSleep })).rejects.toThrow(
      TransientHTTPError
    );
    // 1 initial + 3 retries = 4 total attempts
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("propagates non-transient errors immediately with zero retries", async () => {
    const fn = vi.fn(async () => {
      throw new NonTransientHTTPError(400, "Bad Request");
    });

    await expect(withRetry(fn, { sleepFn: noSleep })).rejects.toThrow(NonTransientHTTPError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("propagates 401 immediately with zero retries", async () => {
    const fn = vi.fn(async () => {
      throw new NonTransientHTTPError(401, "Unauthorized");
    });

    await expect(withRetry(fn, { sleepFn: noSleep })).rejects.toThrow(NonTransientHTTPError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("propagates 403 immediately with zero retries", async () => {
    const fn = vi.fn(async () => {
      throw new NonTransientHTTPError(403, "Forbidden");
    });

    await expect(withRetry(fn, { sleepFn: noSleep })).rejects.toThrow(NonTransientHTTPError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on Node.js connection errors", async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount <= 1) {
        const err = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });
        throw err;
      }
      return "connected";
    });

    const result = await withRetry(fn, { sleepFn: noSleep });
    expect(result).toBe("connected");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("uses correct exponential backoff delays", async () => {
    const delays: number[] = [];
    const sleepFn = async (ms: number) => {
      delays.push(ms);
    };

    const fn = vi.fn(async () => {
      throw new TransientHTTPError(500, "error");
    });

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelay: 2000, maxDelay: 30000, jitter: 0, sleepFn })
    ).rejects.toThrow();

    // Delays: 2000, 4000, 8000
    expect(delays).toEqual([2000, 4000, 8000]);
  });

  it("uses default config when no options provided", () => {
    expect(DEFAULT_RETRY_CONFIG).toEqual({
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 30000,
      jitter: 500,
    });
  });

  it("handles custom maxRetries", async () => {
    const fn = vi.fn(async () => {
      throw new TransientHTTPError(503, "fail");
    });

    await expect(withRetry(fn, { maxRetries: 1, sleepFn: noSleep })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it("preserves error type when retries exhausted", async () => {
    const fn = vi.fn(async () => {
      throw new TransientHTTPError(429, "Rate Limited");
    });

    try {
      await withRetry(fn, { maxRetries: 2, sleepFn: noSleep });
    } catch (e) {
      expect(e).toBeInstanceOf(TransientHTTPError);
      expect((e as TransientHTTPError).statusCode).toBe(429);
    }
  });
});
