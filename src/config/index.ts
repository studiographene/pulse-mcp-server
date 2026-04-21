/**
 * Runtime config. Reads from environment, falls back to sensible defaults.
 */
import { homedir } from 'os';

export interface AppConfig {
	pulseApiBaseUrl: string;
	tokenFilePath?: string;
	requestTimeoutMs: number;
}

/** Expand a leading `~` in a path. Node doesn't do this for us. */
function expandHome(path: string | undefined): string | undefined {
	if (!path) return path;
	if (path === '~') return homedir();
	if (path.startsWith('~/')) return `${homedir()}/${path.slice(2)}`;
	return path;
}

export function loadConfig(): AppConfig {
	return {
		pulseApiBaseUrl:
			process.env.PULSE_API_BASE_URL ?? 'https://prod.apis.pulse.studiographene.com',
		tokenFilePath: expandHome(process.env.PULSE_MCP_TOKEN_PATH),
		// Default 60s: observed metric endpoints take 3–30s against live data;
		// 10s was too aggressive for real queries. Override via PULSE_API_TIMEOUT_MS.
		requestTimeoutMs: Number(process.env.PULSE_API_TIMEOUT_MS ?? 60_000),
	};
}
