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

/** Extract the Pulse user UUID (`sub`) if present, else null. */
export function userIdFromToken(token: string): string | null {
	const claims = decodeJwtPayload(token);
	const sub = claims?.sub;
	return typeof sub === 'string' ? sub : null;
}
