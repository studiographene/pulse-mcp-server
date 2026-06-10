/**
 * Regression cover for the version-upgrades `rag` enum drift.
 *
 * The v2 BE endpoint `/v2/projects/{id}/metrics/tsc/version-upgrades` validates
 * `rag` against `critical | major | minor | uptoDate` (same buckets as the
 * rollup response). The MCP schema previously accepted
 * `major | minor | patch | deprecated`, inherited from a different BE DTO
 * used by product-security / test-coverage. The mismatch meant:
 *
 *   - `critical` was rejected by the MCP schema before reaching the API,
 *     so the most important severity bucket was unfilterable.
 *   - `deprecated` and `patch` were passed through and 400'd from the API.
 *
 * The override on VersionUpgradesInput aligns the MCP schema with what the
 * v2 BE actually accepts. This spec locks it down so future drift fails CI.
 */

import { getVersionUpgradesTool } from '../src/tools/technical';

const validRags = ['critical', 'major', 'minor', 'uptoDate'] as const;
const invalidRags = ['deprecated', 'patch', 'red', 'amber', 'green', 'CRITICAL'] as const;

describe('pulse_get_version_upgrades — rag enum', () => {
	const baseArgs = {
		projectId: '11111111-1111-1111-1111-111111111111',
		view: 'breakdown' as const,
	};

	it.each(validRags)('accepts rag="%s" (matches v2 BE enum)', (rag) => {
		expect(() =>
			getVersionUpgradesTool.inputSchema.parse({ ...baseArgs, rag })
		).not.toThrow();
	});

	it.each(invalidRags)('rejects rag="%s" (not accepted by v2 BE)', (rag) => {
		expect(() =>
			getVersionUpgradesTool.inputSchema.parse({ ...baseArgs, rag })
		).toThrow();
	});

	it('passes rag="critical" through to the BE query (the previously-blocked path)', async () => {
		const requests: Array<Record<string, unknown>> = [];
		const ctx = {
			api: {
				request: async (req: Record<string, unknown>) => {
					requests.push(req);
					return { data: [] };
				},
			},
		} as never;

		const args = getVersionUpgradesTool.inputSchema.parse({
			...baseArgs,
			rag: 'critical',
			responseFormat: 'full',
		});
		await getVersionUpgradesTool.handler(args, ctx);

		// First request might be the repo resolve; find the metrics request.
		const metricsReq = requests.find((r) =>
			String(r.path ?? '').includes('/metrics/tsc/version-upgrades')
		) as { query: { rag: string } } | undefined;
		expect(metricsReq).toBeDefined();
		expect(metricsReq!.query.rag).toBe('critical');
	});
});
