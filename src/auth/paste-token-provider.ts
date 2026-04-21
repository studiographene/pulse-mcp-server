import { AuthProvider, PulseToken, TokenStore } from './types';

/**
 * v1 AuthProvider: reads a pasted Pulse access token from the TokenStore.
 *
 * Flow:
 *   1. User logs into pulse.studiographene.com in their browser
 *   2. User copies the `token` cookie value from DevTools
 *   3. User writes it to ~/.pulse-mcp/token.json
 *   4. This provider reads it for every tool call
 *
 * On 401, refresh() throws — the user must paste a new token.
 * On 419 (re-issue), the API client is responsible for writing the rotated token back to the store.
 *
 * v2 will replace this with GoogleOAuthProvider that triggers the MCP-mediated OAuth flow.
 */
export class PasteTokenProvider implements AuthProvider {
	public constructor(private readonly store: TokenStore) {}

	public async getToken(userId?: string): Promise<PulseToken> {
		const token = await this.store.get(userId);
		if (!token?.accessToken) {
			throw new Error(
				'No Pulse access token found. ' +
					'Log into https://pulse.studiographene.com, copy the `token` cookie value, ' +
					'and save it to ~/.pulse-mcp/token.json as { "accessToken": "..." }'
			);
		}
		return token;
	}

	public async refresh(): Promise<PulseToken> {
		throw new Error(
			'Pulse token expired or rejected. ' +
				'Grab a fresh token from your browser cookies on pulse.studiographene.com ' +
				'and update ~/.pulse-mcp/token.json'
		);
	}
}
