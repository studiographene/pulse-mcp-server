/**
 * Decode a Pulse JWT's payload without verifying the signature. We never need
 * to verify — the Pulse BE does that on every request. We only need the `sub`
 * claim (user UUID) for telemetry so events correlate with the same userId
 * Pulse product Amplitude events already use.
 *
 * Returns null if the token is malformed — callers treat that as "no userId".
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	try {
		const payload = parts[1]
			.replace(/-/g, '+')
			.replace(/_/g, '/')
			.padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
		return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
	} catch {
		return null;
	}
}

/**
 * Tokens issued by the Pulse-side MCP-token feature (PX-XXXX) are opaque random
 * strings prefixed `pulse_mcp_`, not JWTs. We can't extract a userId from them
 * locally — callers must fall back to a `/users/me` lookup.
 */
export const OPAQUE_MCP_TOKEN_PREFIX = 'pulse_mcp_';

/** True if the token is an opaque MCP-token (no claims to decode). */
export function isOpaqueMcpToken(token: string): boolean {
	return token.startsWith(OPAQUE_MCP_TOKEN_PREFIX);
}

/**
 * Extract the Pulse user UUID (`sub`) from a JWT-shaped Pulse cookie token.
 * Returns null for opaque MCP tokens or any other non-JWT shape — callers
 * resolve userId via /users/me in those cases.
 */
export function userIdFromToken(token: string): string | null {
	if (isOpaqueMcpToken(token)) return null;
	const claims = decodeJwtPayload(token);
	const sub = claims?.sub;
	return typeof sub === 'string' ? sub : null;
}
