/**
 * Auth abstractions for Pulse MCP server.
 *
 * v1 (local, single-user): paste-token flow. TokenStore is a local file (~/.pulse-mcp/token.json).
 * v2 (hosted, multi-user): Google OAuth + per-user server-side store (e.g. Redis, encrypted DB).
 *
 * All downstream code depends on these interfaces, not concrete impls — so v2 migration
 * swaps implementations without touching tool handlers.
 */

export interface PulseToken {
	accessToken: string;
	/** Optional ISO8601 expiry. Pulse tokens have ~14d cookie maxAge; exact server-side expiry unknown. */
	expiresAt?: string;
	/** Pulse user id (UUID), if known. Populated after first /users/me call. */
	userId?: string;
	/** Pulse user email, if known. */
	email?: string;
}

/**
 * Persistent storage for Pulse access tokens.
 *
 * v1 impl: single-user file store. userId is ignored / defaults to "self".
 * v2 impl: multi-tenant, keyed by Pulse userId.
 */
export interface TokenStore {
	get(userId?: string): Promise<PulseToken | null>;
	set(token: PulseToken, userId?: string): Promise<void>;
	clear(userId?: string): Promise<void>;
}

/**
 * Resolves a fresh Pulse access token for a given user, triggering re-authentication if needed.
 *
 * v1 impl: reads from paste-token file; if missing, prompts user to paste (via MCP tool or env).
 * v2 impl: triggers Google OAuth redirect via MCP client.
 */
export interface AuthProvider {
	getToken(userId?: string): Promise<PulseToken>;
	/** Called after a 401 to refresh/re-prompt. */
	refresh(userId?: string): Promise<PulseToken>;
}
