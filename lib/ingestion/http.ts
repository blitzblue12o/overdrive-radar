/**
 * Bounded HTTP helpers for feed + geocoder fetches.
 * Retries only transient failures; never retries parse/config errors.
 */

export const FEED_TIMEOUT_MS = 25_000;
export const GEOCODER_TIMEOUT_MS = 10_000;

const RETRY_DELAYS_MS = [2_000, 8_000] as const;

export type TransientHttpErrorCode =
  | "timeout"
  | "network"
  | "http_429"
  | "http_502"
  | "http_503"
  | "http_504";

export class TransientHttpError extends Error {
  readonly code: TransientHttpErrorCode;
  readonly status?: number;

  constructor(code: TransientHttpErrorCode, message: string, status?: number) {
    super(message);
    this.name = "TransientHttpError";
    this.code = code;
    this.status = status;
  }
}

export class NonRetryableHttpError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "NonRetryableHttpError";
    this.status = status;
  }
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function isTransientError(err: unknown): boolean {
  if (err instanceof TransientHttpError) return true;
  if (err instanceof NonRetryableHttpError) return false;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("network") || msg.includes("fetch failed")) {
      return true;
    }
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type FetchWithRetryOptions = {
  url: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Max attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Called before each retry wait. */
  onRetry?: (attempt: number, err: unknown) => void;
};

/**
 * Fetch with timeout + exponential-ish backoff for transient failures.
 * Attempt 1 → wait 2s → attempt 2 → wait 8s → attempt 3 → throw.
 */
export async function fetchWithRetry(
  options: FetchWithRetryOptions
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? FEED_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(options.url, {
        headers: options.headers,
        cache: "no-store",
        signal: controller.signal,
      });

      if (isRetryableHttpStatus(res.status)) {
        throw new TransientHttpError(
          `http_${res.status}` as TransientHttpErrorCode,
          `HTTP ${res.status} for ${options.url}`,
          res.status
        );
      }

      if (!res.ok) {
        throw new NonRetryableHttpError(
          `HTTP ${res.status} for ${options.url}`,
          res.status
        );
      }

      return res;
    } catch (err) {
      lastError = err;
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new TransientHttpError(
          "timeout",
          `Request timed out after ${timeoutMs}ms for ${options.url}`
        );
      } else if (
        !(err instanceof TransientHttpError) &&
        !(err instanceof NonRetryableHttpError) &&
        err instanceof TypeError
      ) {
        lastError = new TransientHttpError(
          "network",
          `Network error for ${options.url}: ${err.message}`
        );
      }

      const retryable =
        lastError instanceof TransientHttpError ||
        (isTransientError(lastError) &&
          !(lastError instanceof NonRetryableHttpError));

      if (!retryable || attempt >= maxAttempts) {
        throw lastError;
      }

      const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      options.onRetry?.(attempt, lastError);
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Fetch failed for ${options.url}`);
}

export type ConditionalFeedResult =
  | {
      status: "ok";
      text: string;
      etag: string | null;
      lastModified: string | null;
      contentType: string | null;
    }
  | {
      status: "not_modified";
      etag: string | null;
      lastModified: string | null;
    };

/**
 * ICS/RSS feed fetch with optional If-None-Match / If-Modified-Since.
 */
export async function fetchFeedConditional(options: {
  url: string;
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
  onRetry?: (attempt: number, err: unknown) => void;
}): Promise<ConditionalFeedResult> {
  const headers: Record<string, string> = {
    "User-Agent": "OverdriveRadarIngestion/1.0",
    Accept: "text/calendar, application/rss+xml, application/xml, text/xml, */*",
  };
  if (options.etag) headers["If-None-Match"] = options.etag;
  if (options.lastModified) headers["If-Modified-Since"] = options.lastModified;

  const timeoutMs = options.timeoutMs ?? FEED_TIMEOUT_MS;
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(options.url, {
        headers,
        cache: "no-store",
        signal: controller.signal,
      });

      if (res.status === 304) {
        return {
          status: "not_modified",
          etag: res.headers.get("etag") ?? options.etag ?? null,
          lastModified:
            res.headers.get("last-modified") ?? options.lastModified ?? null,
        };
      }

      if (isRetryableHttpStatus(res.status)) {
        throw new TransientHttpError(
          `http_${res.status}` as TransientHttpErrorCode,
          `HTTP ${res.status} for ${options.url}`,
          res.status
        );
      }

      if (!res.ok) {
        throw new NonRetryableHttpError(
          `HTTP ${res.status} for ${options.url}`,
          res.status
        );
      }

      const text = await res.text();
      return {
        status: "ok",
        text,
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        contentType: res.headers.get("content-type"),
      };
    } catch (err) {
      lastError = err;
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new TransientHttpError(
          "timeout",
          `Request timed out after ${timeoutMs}ms for ${options.url}`
        );
      } else if (
        !(err instanceof TransientHttpError) &&
        !(err instanceof NonRetryableHttpError) &&
        err instanceof TypeError
      ) {
        lastError = new TransientHttpError(
          "network",
          `Network error for ${options.url}: ${err.message}`
        );
      }

      const retryable =
        lastError instanceof TransientHttpError ||
        (isTransientError(lastError) &&
          !(lastError instanceof NonRetryableHttpError));

      if (!retryable || attempt >= maxAttempts) {
        throw lastError;
      }

      const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      options.onRetry?.(attempt, lastError);
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Feed fetch failed for ${options.url}`);
}
