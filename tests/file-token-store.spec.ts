import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileTokenStore } from '../src/auth/file-token-store';

describe('FileTokenStore', () => {
	let tmpPath: string;

	beforeEach(async () => {
		tmpPath = join(tmpdir(), `pulse-mcp-test-${Date.now()}-${Math.random()}`, 'token.json');
	});

	afterEach(async () => {
		try {
			await fs.rm(tmpPath, { force: true });
		} catch {
			// best-effort cleanup
		}
	});

	it('returns null when file does not exist', async () => {
		const store = new FileTokenStore(tmpPath);
		await expect(store.get()).resolves.toBeNull();
	});

	it('writes then reads a token', async () => {
		const store = new FileTokenStore(tmpPath);
		await store.set({ accessToken: 'abc123', email: 'a@b.com' });
		await expect(store.get()).resolves.toEqual({ accessToken: 'abc123', email: 'a@b.com' });
	});

	it('overwrites previous token on set', async () => {
		const store = new FileTokenStore(tmpPath);
		await store.set({ accessToken: 'first' });
		await store.set({ accessToken: 'second' });
		const got = await store.get();
		expect(got?.accessToken).toBe('second');
	});

	it('clear() removes the file and subsequent get() returns null', async () => {
		const store = new FileTokenStore(tmpPath);
		await store.set({ accessToken: 'will-be-deleted' });
		await store.clear();
		await expect(store.get()).resolves.toBeNull();
	});

	it('clear() is a no-op when file is already absent', async () => {
		const store = new FileTokenStore(tmpPath);
		await expect(store.clear()).resolves.toBeUndefined();
	});

	it('writes with mode 0600 (owner read/write only)', async () => {
		const store = new FileTokenStore(tmpPath);
		await store.set({ accessToken: 'secret' });
		const stat = await fs.stat(tmpPath);
		// Check that group/other permissions are stripped (mask 0o077).
		expect(stat.mode & 0o077).toBe(0);
	});
});
