export interface RetryConfig {
	maxAttempts: number;
	initialDelayMs: number;
	maxDelayMs: number;
	jitterRatio: number;
}

export interface AppConfig {
	kafka: RetryConfig;
	gemini: RetryConfig & { timeoutMs: number };
	clickhouse: RetryConfig;
}

function boundedNumber(name: string, fallback: number, minimum: number, maximum: number): number {
	const value = Number(process.env[name]);
	if (!Number.isFinite(value)) return fallback;
	return Math.min(maximum, Math.max(minimum, value));
}

function retryConfig(prefix: string): RetryConfig {
	return {
		maxAttempts: boundedNumber(`${prefix}_RETRY_MAX_ATTEMPTS`, 3, 1, 5),
		initialDelayMs: boundedNumber(`${prefix}_RETRY_INITIAL_DELAY_MS`, 250, 25, 5_000),
		maxDelayMs: boundedNumber(`${prefix}_RETRY_MAX_DELAY_MS`, 2_000, 100, 30_000),
		jitterRatio: boundedNumber(`${prefix}_RETRY_JITTER_RATIO`, 0.2, 0, 1),
	};
}

export const config: AppConfig = Object.freeze({
	kafka: retryConfig("KAFKA"),
	gemini: {
		...retryConfig("GEMINI"),
		timeoutMs: boundedNumber("GEMINI_TIMEOUT_MS", 15_000, 1_000, 120_000),
	},
	clickhouse: retryConfig("CLICKHOUSE"),
});
