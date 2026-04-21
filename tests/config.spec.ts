/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { homedir } from 'os';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
	const ORIGINAL_ENV = { ...process.env };

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it('falls back to prod base URL when PULSE_API_BASE_URL is unset', () => {
		delete process.env.PULSE_API_BASE_URL;
		expect(loadConfig().pulseApiBaseUrl).toBe('https://prod.apis.pulse.studiographene.com');
	});

	it('uses PULSE_API_BASE_URL when set', () => {
		process.env.PULSE_API_BASE_URL = 'https://staging.example.com';
		expect(loadConfig().pulseApiBaseUrl).toBe('https://staging.example.com');
	});

	it('expands ~ in PULSE_MCP_TOKEN_PATH', () => {
		process.env.PULSE_MCP_TOKEN_PATH = '~/custom/token.json';
		expect(loadConfig().tokenFilePath).toBe(`${homedir()}/custom/token.json`);
	});

	it('leaves absolute paths in PULSE_MCP_TOKEN_PATH unchanged', () => {
		process.env.PULSE_MCP_TOKEN_PATH = '/absolute/path/token.json';
		expect(loadConfig().tokenFilePath).toBe('/absolute/path/token.json');
	});

	it('defaults requestTimeoutMs to 60000', () => {
		delete process.env.PULSE_API_TIMEOUT_MS;
		expect(loadConfig().requestTimeoutMs).toBe(60_000);
	});

	it('parses PULSE_API_TIMEOUT_MS as a number', () => {
		process.env.PULSE_API_TIMEOUT_MS = '15000';
		expect(loadConfig().requestTimeoutMs).toBe(15_000);
	});
});
