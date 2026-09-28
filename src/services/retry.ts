import type { RetryConfig } from "../config.js";

export interface RetryOptions extends RetryConfig {
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.maxAttempts || (options.shouldRetry && !options.shouldRetry(error))) {
        throw error;
      }

      const baseDelay = Math.min(
        options.maxDelayMs,
        options.initialDelayMs * 2 ** (attempt - 1),
      );
      const jitter = baseDelay * options.jitterRatio;
      const delayMs = Math.max(0, Math.round(baseDelay + (Math.random() * 2 - 1) * jitter));
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }

  throw new Error("Retry operation completed without a result");
}

export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown };
  if (candidate.name === "TimeoutError") return true;

  const status = candidate.status ?? candidate.statusCode;
  if (typeof status === "number") return status === 408 || status === 425 || status === 429 || status >= 500;

  return typeof candidate.code === "string" && [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENETUNREACH",
    "ERR_NETWORK",
  ].includes(candidate.code);
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}