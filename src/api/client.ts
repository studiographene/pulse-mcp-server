import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import http from 'http';
import https from 'https';
import { AuthProvider, TokenStore } from '../auth/types';
import { RequestOptions, ReissueTokenResponse } from './types';

/**
 * Cap on simultaneous in-flight Pulse requests.
 *
 * Originally introduced (PX-3685, May 2026) as a tight cap of 6 to keep the
 * MCP below the threshold at which a BE singleton bug leaked one user's
 * response data into another's. That bug was fixed in pulse-data-integration#1672
 * (per-request `responseParser` factory) and verified across two 40+
 * parallel-call sweeps with zero cross-pollination. The cap is now a
 * defensive backstop against accidental fan-out (e.g. an agent that maps
 * over the whole org) rather than a load-shedding measure — 20 leaves plenty
 * of headroom for normal use without ever firing a thundering herd at the BE.
 */
const MAX_CONCURRENT_REQUESTS = 20;

/**
 * Tiny in-house concurrency limiter. Resolves the gate when an in-flight
 * slot frees up; FIFO order. Avoids adding p-limit as a runtime dep for
 * ~20 LOC of logic. Closure-based to keep the file at one class
 * (lint: max-classes-per-file).
 */
function createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
	let active = 0;
	const queue: Array<() => void> = [];
	return async function run<T>(fn: () => Promise<T>): Promise<T> {
		if (active >= max) {
			await new Promise<void>((resolve) => {
				queue.push(resolve);
			});
		}
		active += 1;
		try {
			return await fn();
		} finally {
			active -= 1;
			const next = queue.shift();
			if (next) next();
		}
	};
}

/**
 * Serialises query params in the shape Pulse's BE expects:
 *   arrays -> repeated `name[]=value` (matches the live FE traffic we observed)
 *   primitives -> standard encoding
 *   null/undefined -> skipped
 */
function serialiseParams(params: Record<string, unknown> | undefined): string {
	if (!params) return '';
	const parts: string[] = [];
	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null) return;
		if (Array.isArray(value)) {
			value.forEach((v) => {
				parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(String(v))}`);
			});
		} else {
			parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		}
	});
	return parts.join('&');
}

export interface PulseApiClientOptions {
	baseUrl: string;
	auth: AuthProvider;
	tokenStore: TokenStore;
	/** Request timeout in ms. Default 60s (metric endpoints can take 3–30s). */
	timeoutMs?: number;
}

/**
 * Thin wrapper around the Pulse REST API that handles:
 *   - Bearer auth injection (via AuthProvider)
 *   - 419 rotation (persists rotated token back to TokenStore)
 *   - 401 refresh (delegates to AuthProvider.refresh and retries once)
 *
 * Purposely does NOT know about individual endpoints — tool handlers describe
 * endpoints themselves and call `request()`. Keeps this file small and stable
 * as the tool surface grows.
 */
export class PulseApiClient {
	private readonly http: AxiosInstance;

	private readonly runLimited = createLimiter(MAX_CONCURRENT_REQUESTS);

	public constructor(private readonly opts: PulseApiClientOptions) {
		this.http = axios.create({
			baseURL: opts.baseUrl,
			timeout: opts.timeoutMs ?? 60_000,
			// Fresh TCP connection per request. Introduced alongside PX-3685
			// as a belt-and-braces mitigation when we suspected connection
			// reuse was part of the pollution vector. The BE root cause has
			// since been fixed, but the cost is negligible for a human-driven
			// MCP (one TLS handshake per call) and there's no upside to
			// connection pooling here — keep the isolation for cheap defence
			// against any future shared-state regressions.
			httpAgent: new http.Agent({ keepAlive: false }),
			httpsAgent: new https.Agent({ keepAlive: false }),
		});
	}

	public async request<T = unknown>(options: RequestOptions): Promise<T> {
		// Gate every outbound request behind the limiter. The limiter is
		// per-client (so per-MCP-process); we don't share state with any
		// other consumer of the BE.
		const response = await this.runLimited(() => this.executeWithRetry<T>(options));
		return response.data;
	}

	private async executeWithRetry<T>(
		options: RequestOptions,
		alreadyRefreshed = false
	): Promise<AxiosResponse<T>> {
		const token = await this.opts.auth.getToken(options.userId);
		const config: AxiosRequestConfig = {
			method: options.method,
			url: options.path,
			params: options.query,
			paramsSerializer: { serialize: serialiseParams },
			data: options.body,
			headers: { Authorization: `Bearer ${token.accessToken}` },
			validateStatus: (s) => s < 500 || s === 419,
		};

		const response = await this.http.request<T>(config);

		if (response.status === 419) {
			const rotated = (response.data as unknown as ReissueTokenResponse)?.data?.token;
			if (rotated) {
				await this.opts.tokenStore.set(
					{ ...token, accessToken: rotated },
					options.userId
				);
				return this.executeWithRetry<T>(options, alreadyRefreshed);
			}
		}

		if (response.status === 401 && !alreadyRefreshed) {
			await this.opts.auth.refresh(options.userId);
			return this.executeWithRetry<T>(options, true);
		}

		if (response.status >= 400) {
			throw new Error(
				`Pulse API ${options.method} ${options.path} failed: ${response.status} ${JSON.stringify(
					response.data
				)}`
			);
		}

		return response;
	}
}
