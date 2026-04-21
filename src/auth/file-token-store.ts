import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { PulseToken, TokenStore } from './types';

/**
 * v1 TokenStore: single-user, file-backed.
 *
 * Stores the Pulse access token at ~/.pulse-mcp/token.json with 0600 permissions.
 * userId param is accepted for interface compatibility but ignored (single-tenant).
 */
export class FileTokenStore implements TokenStore {
	private readonly path: string;

	public constructor(path?: string) {
		this.path = path ?? join(homedir(), '.pulse-mcp', 'token.json');
	}

	// userId is accepted for interface compatibility (multi-tenant v2) but ignored here.
	public async get(_userId?: string): Promise<PulseToken | null> {
		try {
			const raw = await fs.readFile(this.path, 'utf8');
			return JSON.parse(raw) as PulseToken;
		} catch (err: unknown) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw err;
		}
	}

	public async set(token: PulseToken, _userId?: string): Promise<void> {
		await fs.mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
		await fs.writeFile(this.path, JSON.stringify(token, null, 2), { mode: 0o600 });
	}

	public async clear(_userId?: string): Promise<void> {
		try {
			await fs.unlink(this.path);
		} catch (err: unknown) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
		}
	}
}
