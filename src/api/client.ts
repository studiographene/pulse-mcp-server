import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { AuthProvider, TokenStore } from '../auth/types';
import { RequestOptions, ReissueTokenResponse } from './types';

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
	/** Request timeout in ms. Default 10s. */
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

	public constructor(private readonly opts: PulseApiClientOptions) {
		this.http = axios.create({
			baseURL: opts.baseUrl,
			timeout: opts.timeoutMs ?? 10_000,
		});
	}

	public async request<T = unknown>(options: RequestOptions): Promise<T> {
		const response = await this.executeWithRetry<T>(options);
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
