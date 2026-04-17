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
		requestTimeoutMs: Number(process.env.PULSE_API_TIMEOUT_MS ?? 10_000),
	};
}
