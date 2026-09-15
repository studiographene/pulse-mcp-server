/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Regression cover for PX-3758: `pulse_get_product_security` returned
 * `headline: 0, region: GREEN` on projects with hundreds of live findings.
 *
 * Root cause: the BE rollup forwards `branch` straight to the downstream
 * technical-metrics service, which returns an all-zero series when no branch
 * is supplied. The Pulse UI never hits that path because its BranchesProvider
 * always has a branch selected; the MCP sent nothing. Verified live against
 * the Pulse project (57db30ad…): no branch -> 0/GREEN, branch=master -> 203/RED,
 * matching the UI exactly.
 *
 * Secondary defect: the tool advertised `search`, `page`, `limit`, `sortKey`
 * and `sortOrder`, none of which exist on the BE's `ProdSecurityDetailDTO`,
 * and did not expose `afterKey`, which is the only pagination mechanism the
 * endpoint actually supports. It also advertised the version-upgrades rag
 * enum, which 400s here.
 *
 * The brief's own lesson drives the shape of these tests: the previous suite
 * asserted response *shape*, which passes happily on a wrong number. These
 * assert that a wrong-number scenario is impossible — the branch is always
 * sent, and the headline is checked against a non-zero fixture.
 */

import { getProductSecurityTool } from '../src/tools/technical';
import { ToolContext } from '../src/tools/types';

const projectId = '11111111-1111-1111-1111-111111111111';

/**
 * Stands in for the live BE: returns a real headline only when a branch is
 * present, exactly as the downstream technical-metrics service behaves.
 */
function mockApi(opts: {
	branches?: unknown;
	branchesThrow?: boolean;
}): { ctx: ToolContext; requests: any[] } {
	const requests: any[] = [];
	return {
		requests,
		ctx: {
			api: {
				request: async (req: any) => {
					requests.push(req);
					if (req.path.endsWith('/github-branches')) {
						if (opts.branchesThrow) throw new Error('500 boom');
						return opts.branches;
					}
					if (req.path.includes('/metrics/tsc/product-security')) {
						const hasBranch = Boolean(req.query?.branch);
						return {
							statusCode: 200,
							data: {
								headline: hasBranch ? 203 : 0,
								graphData: [{ date: '2026-09-15', value: hasBranch ? 203 : 0 }],
								region: hasBranch ? 'RED' : 'GREEN',
							},
						};
					}
					// project lookup for repoIds
					return {
						data: {
							companyId: 'c1',
							tools: [
								{ name: 'GITHUB', meta: [{ integratorId: 'gh_repo_1' }] },
							],
						},
					};
				},
			} as any,
		},
	};
}

function securityRequest(requests: any[]): any {
	return requests.find((r) => String(r.path).includes('/metrics/tsc/product-security'));
}

describe('pulse_get_product_security — branch resolution (PX-3758)', () => {
	it('resolves a default branch and returns the real headline, not zero', async () => {
		const { ctx, requests } = mockApi({ branches: ['dev', 'master', 'qa'] });
		const args = getProductSecurityTool.inputSchema.parse({ projectId });
		const res = (await getProductSecurityTool.handler(args, ctx)) as any;

		// The whole point of the fix: a non-zero headline reaches the caller.
		expect(res.data.headline).toBe(203);
		expect(res.data.region).toBe('RED');
		expect(securityRequest(requests).query.branch).toBe('master');
	});

	// prod > master > main > uat > stage > qa > dev > develop.
	// Each case gets its own projectId so the branch cache can't bleed across them.
	it.each([
		['prod', ['dev', 'master', 'prod', 'qa'], 'aaaaaaa1-1111-1111-1111-111111111111'],
		['master', ['dev', 'qa', 'master'], 'aaaaaaa2-1111-1111-1111-111111111111'],
		['main', ['dev', 'main', 'qa'], 'aaaaaaa3-1111-1111-1111-111111111111'],
		['uat', ['dev', 'qa', 'uat'], 'aaaaaaa4-1111-1111-1111-111111111111'],
		['stage', ['dev', 'qa', 'stage'], 'aaaaaaa5-1111-1111-1111-111111111111'],
		['qa', ['dev', 'qa'], 'aaaaaaa6-1111-1111-1111-111111111111'],
		['dev', ['develop', 'dev'], 'aaaaaaa7-1111-1111-1111-111111111111'],
		['develop', ['develop'], 'aaaaaaa8-1111-1111-1111-111111111111'],
	])('resolves "%s" from %j in UI priority order', async (expected, branches, pid) => {
		const { ctx, requests } = mockApi({ branches });
		const args = getProductSecurityTool.inputSchema.parse({ projectId: pid });
		await getProductSecurityTool.handler(args, ctx);
		expect(securityRequest(requests).query.branch).toBe(expected);
	});

	it('matches branch names case-insensitively, as the FE does', async () => {
		const { ctx, requests } = mockApi({ branches: ['Dev', 'MASTER'] });
		const args = getProductSecurityTool.inputSchema.parse({
			projectId: 'bbbbbbb1-1111-1111-1111-111111111111',
		});
		await getProductSecurityTool.handler(args, ctx);
		expect(securityRequest(requests).query.branch).toBe('master');
	});

	it('falls back to the first available branch when none match the priority list', async () => {
		const { ctx, requests } = mockApi({ branches: ['release-2024', 'feature/x'] });
		const args = getProductSecurityTool.inputSchema.parse({
			projectId: '22222222-2222-2222-2222-222222222222',
		});
		await getProductSecurityTool.handler(args, ctx);
		expect(securityRequest(requests).query.branch).toBe('release-2024');
	});

	it('honours an explicitly passed branch and marks it as such in _scope', async () => {
		const { ctx, requests } = mockApi({ branches: ['master'] });
		const args = getProductSecurityTool.inputSchema.parse({
			projectId: '33333333-3333-3333-3333-333333333333',
			branch: 'uat',
		});
		const res = (await getProductSecurityTool.handler(args, ctx)) as any;
		expect(securityRequest(requests).query.branch).toBe('uat');
		expect(res._scope.branch).toBe('uat');
		expect(res._scope.branchSource).toBe('passed');
		// No branch lookup needed when the caller supplied one.
		expect(requests.some((r) => String(r.path).endsWith('/github-branches'))).toBe(false);
	});

	it('warns loudly when no branch could be resolved, so 0 is not read as clean', async () => {
		const { ctx } = mockApi({ branches: [] });
		const args = getProductSecurityTool.inputSchema.parse({
			projectId: '44444444-4444-4444-4444-444444444444',
		});
		const res = (await getProductSecurityTool.handler(args, ctx)) as any;
		expect(res._scope.branch).toBeUndefined();
		expect(res._scope.note).toContain('NOT evidence of a clean security posture');
	});

	it('degrades gracefully when the branch lookup itself fails', async () => {
		const { ctx } = mockApi({ branchesThrow: true });
		const args = getProductSecurityTool.inputSchema.parse({
			projectId: '55555555-5555-5555-5555-555555555555',
		});
		// Must not throw — the metric call still runs, with the caveat attached.
		const res = (await getProductSecurityTool.handler(args, ctx)) as any;
		expect(res._scope.branch).toBeUndefined();
		expect(res._scope.note).toBeDefined();
	});
});

describe('pulse_get_product_security — parameter contract', () => {
	it('no longer advertises params the BE silently drops', async () => {
		const shape = (getProductSecurityTool.inputSchema as any).shape;
		for (const dead of ['search', 'page', 'limit', 'sortKey', 'sortOrder']) {
			expect(shape[dead]).toBeUndefined();
		}
	});

	it('exposes afterKey and forwards it as the pagination cursor', async () => {
		const { ctx, requests } = mockApi({ branches: ['master'] });
		const args = getProductSecurityTool.inputSchema.parse({
			projectId: '66666666-6666-6666-6666-666666666666',
			includeDetails: true,
			afterKey: 'WzE3MjMxMTg4Mjk1NDdd',
		});
		await getProductSecurityTool.handler(args, ctx);
		const req = securityRequest(requests);
		expect(req.path).toContain('/product-security/details');
		expect(req.query.afterKey).toBe('WzE3MjMxMTg4Mjk1NDdd');
	});

	it('accepts the rag enum the BE actually validates, and rejects the old one', () => {
		const base = { projectId: '77777777-7777-7777-7777-777777777777' };
		for (const rag of ['red', 'amber', 'green', 'deprecated']) {
			expect(() =>
				getProductSecurityTool.inputSchema.parse({ ...base, rag })
			).not.toThrow();
		}
		// These came from the version-upgrades schema and 400 on this endpoint.
		for (const rag of ['major', 'minor', 'patch', 'critical', 'uptoDate']) {
			expect(() => getProductSecurityTool.inputSchema.parse({ ...base, rag })).toThrow();
		}
	});
});
