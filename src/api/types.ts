/**
 * Shared API types for the Pulse HTTP client.
 */

export interface RequestOptions {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	path: string;
	query?: Record<string, string | number | boolean | string[] | undefined>;
	body?: unknown;
	/** User context for multi-tenant setups (v2). Ignored in v1. */
	userId?: string;
}

/** Response shape from POST /login (from Pulse BE /wiki page 1835499521). */
export interface LoginResponse {
	id: string;
	email: string;
	fullName: string;
	profilePic?: string;
	jobTitle?: string;
	role: 'Admin' | 'PM' | 'Lead' | 'Individual' | string;
	accessToken: string;
	isNewUser: boolean;
}

/**
 * Pulse BE returns 419 with a fresh token payload when the current token
 * should be rotated. Observed in the FE interceptor at src/api/service.ts:74.
 */
export interface ReissueTokenResponse {
	data: {
		token: string;
		[k: string]: unknown;
	};
}
