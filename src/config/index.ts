/**
 * Runtime config. Reads from environment, falls back to sensible defaults.
 */

export interface AppConfig {
	pulseApiBaseUrl: string;
	tokenFilePath?: string;
	requestTimeoutMs: number;
}

export function loadConfig(): AppConfig {
	return {
		pulseApiBaseUrl:
			process.env.PULSE_API_BASE_URL ?? 'https://prod.apis.pulse.studiographene.com',
		tokenFilePath: process.env.PULSE_MCP_TOKEN_PATH,
		// Default 60s: observed metric endpoints take 3–30s against live data;
		// 10s was too aggressive for real queries. Override via PULSE_API_TIMEOUT_MS.
		requestTimeoutMs: Number(process.env.PULSE_API_TIMEOUT_MS ?? 60_000),
	};
}
