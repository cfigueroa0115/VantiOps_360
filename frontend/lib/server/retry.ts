/**
 * Centralized retry policy per REQ-37.
 *
 * Provides a `withRetry` async utility for transient error handling
 * with exponential backoff, jitter, and max delay cap.
 *
 * Configuration (defaults):
 *   - maxRetries: 3
 *   - baseDelay: 2000ms
 *   - maxDelay: 30000ms
 *   - jitter: ±500ms
 *
 * Transient errors (will retry):
 *   - Network errors (fetch failures, ECONNRESET, ETIMEDOUT)
 *   - HTTP 5xx (server errors)
 *   - HTTP 429 (rate limited)
 *   - HTTP 503 (service unavailable)
 *
 * Non-transient errors (zero retries, propagate immediately):
 *   - HTTP 400 (validation error)
 *   - HTTP 401 (unauthorized)
 *   - HTTP 403 (forbidden)
 *   - HTTP 404 (not found)
 *   - HTTP 422 (invalid transition / unprocessable)
 *   - Any error not classified as transient
 */

// --- Types ---

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 2000) */
  baseDelay: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelay: number;
  /** Random jitter in milliseconds applied ±jitter (default: 500) */
  jitter: number;
}

export interface RetryOptions extends Partial<RetryConfig> {
  /** Optional custom sleep function for testing */
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Error class representing a transient HTTP error eligible for retry.
 */
export class TransientHTTPError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string = "") {
    super(`HTTP ${statusCode}: ${message}`);
    this.name = "TransientHTTPError";
    this.statusCode = statusCode;
  }
}

/**
 * Error class representing a non-transient HTTP error that must NOT be retried.
 */
export class NonTransientHTTPError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string = "") {
    super(`HTTP ${statusCode}: ${message}`);
    this.name = "NonTransientHTTPError";
    this.statusCode = statusCode;
  }
}

// --- Constants ---

/** Default retry configuration per REQ-37 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 2000,
  maxDelay: 30000,
  jitter: 500,
};

/** HTTP status codes considered transient (eligible for retry) */
const TRANSIENT_HTTP_CODES = new Set([429, 500, 502, 503, 504]);

/** HTTP status codes considered non-transient (zero retries) */
const NON_TRANSIENT_HTTP_CODES = new Set([400, 401, 403, 404, 422]);

// --- Error classification ---

/**
 * Classify whether an error is transient and eligible for retry.
 *
 * Transient errors:
 *   - Network errors (TypeError from fetch, ECONNRESET, ETIMEDOUT)
 *   - TransientHTTPError instances
 *   - Errors with status codes in TRANSIENT_HTTP_CODES
 *
 * Non-transient errors:
 *   - NonTransientHTTPError instances
 *   - Errors with status codes in NON_TRANSIENT_HTTP_CODES
 *   - Validation errors, authorization errors
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof NonTransientHTTPError) {
    return false;
  }

  if (error instanceof TransientHTTPError) {
    return true;
  }

  // Check for HTTP status code on error objects
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    if (NON_TRANSIENT_HTTP_CODES.has(statusCode)) return false;
    if (TRANSIENT_HTTP_CODES.has(statusCode)) return true;
  }

  // Check for `status` field (common in fetch response errors)
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (NON_TRANSIENT_HTTP_CODES.has(status)) return false;
    if (TRANSIENT_HTTP_CODES.has(status)) return true;
  }

  // Network errors from fetch() manifest as TypeError
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  // Node.js network errors (ECONNRESET, ETIMEDOUT, ECONNREFUSED)
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code;
    const transientCodes = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "EAI_AGAIN"];
    if (transientCodes.includes(code)) return true;
  }

  return false;
}

/**
 * Compute the delay for a given retry attempt.
 *
 * Uses exponential backoff with jitter:
 *   delay = min(baseDelay * 2^attempt, maxDelay) + random(-jitter, +jitter)
 *
 * The final delay is clamped to a minimum of 0.
 */
export function computeDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter: number
): number {
  const exponential = baseDelay * 2 ** attempt;
  const capped = Math.min(exponential, maxDelay);
  const jittered = capped + (Math.random() - 0.5) * 2 * jitter;
  return Math.max(0, jittered);
}

// --- Sleep utility ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Main retry utility ---

/**
 * Execute an async function with retry policy per REQ-37.
 *
 * Retries on transient errors with exponential backoff + jitter.
 * Non-transient errors propagate immediately with zero retries.
 *
 * @param fn - Async function to execute with retries
 * @param options - Optional retry configuration overrides
 * @returns The result of the function on success
 * @throws The last error if all retries are exhausted, or immediately for non-transient errors
 *
 * @example
 * ```ts
 * const data = await withRetry(() => fetchFromDatabase(query));
 *
 * const result = await withRetry(
 *   () => callExternalService(),
 *   { maxRetries: 5, baseDelay: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...options };
  const sleepFn = options.sleepFn ?? sleep;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Non-transient errors: propagate immediately, zero retries
      if (!isTransientError(error)) {
        throw error;
      }

      lastError = err;

      // If this was the last attempt, propagate the error
      if (attempt === config.maxRetries) {
        throw error;
      }

      // Compute delay and wait before next attempt
      const delay = computeDelay(attempt, config.baseDelay, config.maxDelay, config.jitter);
      await sleepFn(delay);
    }
  }

  // Safety net — should not reach here
  throw lastError ?? new Error("Unexpected retry loop exit");
}
