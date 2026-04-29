import {
	decodeJwtPayload,
	isOpaqueMcpToken,
	OPAQUE_MCP_TOKEN_PREFIX,
	userIdFromToken,
} from '../src/auth/jwt-claims';

/* JWT for { sub: 'user-uuid-1', iat: 0 } signed with HS256 secret 'x' — only
 * the payload matters for our tests; we never verify the signature. */
const VALID_JWT =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLXV1aWQtMSIsImlhdCI6MH0.signature';

describe('jwt-claims', () => {
	describe('decodeJwtPayload', () => {
		it('decodes a valid JWT payload', () => {
			expect(decodeJwtPayload(VALID_JWT)).toEqual({ sub: 'user-uuid-1', iat: 0 });
		});

		it('returns null for malformed input', () => {
			expect(decodeJwtPayload('not.a.jwt')).toBeNull();
			expect(decodeJwtPayload('only-one-segment')).toBeNull();
			expect(decodeJwtPayload('two.segments')).toBeNull();
		});
	});

	describe('isOpaqueMcpToken', () => {
		it('detects the pulse_mcp_ prefix', () => {
			expect(isOpaqueMcpToken('pulse_mcp_abcdef1234567890')).toBe(true);
			expect(isOpaqueMcpToken(`${OPAQUE_MCP_TOKEN_PREFIX}xyz`)).toBe(true);
		});

		it('returns false for JWTs and other shapes', () => {
			expect(isOpaqueMcpToken(VALID_JWT)).toBe(false);
			expect(isOpaqueMcpToken('some-other-token')).toBe(false);
			expect(isOpaqueMcpToken('')).toBe(false);
		});
	});

	describe('userIdFromToken', () => {
		it('returns the sub claim for a JWT-shaped token', () => {
			expect(userIdFromToken(VALID_JWT)).toBe('user-uuid-1');
		});

		it('returns null for opaque MCP tokens (caller falls back to /users/me)', () => {
			expect(userIdFromToken('pulse_mcp_abcdef1234567890')).toBeNull();
		});

		it('returns null for unknown shapes', () => {
			expect(userIdFromToken('garbage')).toBeNull();
		});
	});
});
