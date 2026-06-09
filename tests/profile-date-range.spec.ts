/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Regression cover for PX-3537: the BE flipped /activity/profile/:userId from
 * "formal project assignments" to "projects the user has been active in
 * during a date window" and made `range` (or `customRange`) a required
 * query param. The MCP now passes those params on:
 *
 *   - pulse_get_member_profile (explicit user-facing input)
 *   - pulse_get_activity_overview (org-level rollup uses the same window)
 *   - getMemberContext (auto-fetch path for pulse_get_member_metric and
 *     pulse_get_member_rca — inherits the metric's own date scope so the
 *     auto-fetched projectIds cover the same window as the metric query)
 */

import {
	getActivityOverviewTool,
	getMemberMetricTool,
	getMemberProfileTool,
	getMemberRcaTool,
} from '../src/tools/activity';
import { ToolContext } from '../src/tools/types';

function mockApi(handler: (req: any) => unknown): ToolContext {
	const requests: any[] = [];
	return {
		api: {
			request: async (req: any) => {
				requests.push(req);
				return handler(req);
			},
			__requests: requests,
		} as any,
	};
}

const userId = '11111111-1111-1111-1111-111111111111';
const projectId = '22222222-2222-2222-2222-222222222222';
const repoId = 'gh_repo_1234567';

describe('pulse_get_member_profile date scope', () => {
	it("defaults range to '30 days' (matches FE default)", async () => {
		const ctx = mockApi(() => ({ data: { profile: {}, projects: [] } }));
		const args = getMemberProfileTool.inputSchema.parse({ userId });
		await getMemberProfileTool.handler(args, ctx);
		const req = (ctx.api as any).__requests[0];
		expect(req.path).toBe(`/activity/profile/${userId}`);
		expect(req.query.range).toBe('30 days');
		expect(req.query.customRange).toBeUndefined();
	});

	it("forwards explicit range='1 year'", async () => {
		const ctx = mockApi(() => ({ data: { profile: {}, projects: [] } }));
		const args = getMemberProfileTool.inputSchema.parse({ userId, range: '1 year' });
		await getMemberProfileTool.handler(args, ctx);
		const req = (ctx.api as any).__requests[0];
		expect(req.query.range).toBe('1 year');
	});

	it('omits range when customRange is set (BE treats them as mutually exclusive)', async () => {
		const ctx = mockApi(() => ({ data: { profile: {}, projects: [] } }));
		const args = getMemberProfileTool.inputSchema.parse({
			userId,
			customRange: ['2024-01-01', '2026-06-01'],
		});
		await getMemberProfileTool.handler(args, ctx);
		const req = (ctx.api as any).__requests[0];
		expect(req.query.range).toBeUndefined();
		expect(req.query.customRange).toEqual(['2024-01-01', '2026-06-01']);
	});
});

describe('pulse_get_activity_overview date scope', () => {
	it("defaults range to '30 days'", async () => {
		const ctx = mockApi(() => ({ data: { projects: [{ id: 'p1' }], organisationMembers: {} } }));
		const args = getActivityOverviewTool.inputSchema.parse({});
		await getActivityOverviewTool.handler(args, ctx);
		const req = (ctx.api as any).__requests[0];
		expect(req.path).toBe('/activity');
		expect(req.query.range).toBe('30 days');
	});

	it('forwards customRange and omits range', async () => {
		const ctx = mockApi(() => ({ data: { projects: [{ id: 'p1' }], organisationMembers: {} } }));
		const args = getActivityOverviewTool.inputSchema.parse({
			customRange: ['2024-01-01', '2026-06-01'],
		});
		await getActivityOverviewTool.handler(args, ctx);
		const req = (ctx.api as any).__requests[0];
		expect(req.query.range).toBeUndefined();
		expect(req.query.customRange).toEqual(['2024-01-01', '2026-06-01']);
	});
});

describe('auto-fetch inherits metric date scope', () => {
	const profileResponse = {
		data: { projects: [{ id: projectId, repositories: [{ id: repoId }] }] },
	};

	it("FTP with range='1 year' auto-fetches profile with range='1 year' (not the default 30 days)", async () => {
		const ctx = mockApi((req) => {
			if (req.path.startsWith('/activity/profile/')) return profileResponse;
			return { ok: true };
		});
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'FTP',
			range: '1 year',
		});
		await getMemberMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe(`/activity/profile/${userId}`);
		expect(reqs[0].query.range).toBe('1 year');
		expect(reqs[0].query.customRange).toBeUndefined();
		// Downstream metric call should use the same range.
		expect(reqs[1].query.range).toBe('1 year');
	});

	it('FTP with customRange forwards the same customRange to auto-fetch', async () => {
		const ctx = mockApi((req) => {
			if (req.path.startsWith('/activity/profile/')) return profileResponse;
			return { ok: true };
		});
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'FTP',
			customRange: ['2024-01-01', '2026-06-01'],
		});
		await getMemberMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].query.range).toBeUndefined();
		expect(reqs[0].query.customRange).toEqual(['2024-01-01', '2026-06-01']);
	});

	it('CODE_COMMIT auto-fetch inherits the metric range', async () => {
		const ctx = mockApi((req) => {
			if (req.path.startsWith('/activity/profile/')) return profileResponse;
			return { ok: true };
		});
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'CODE_COMMIT',
			range: '7 days',
		});
		await getMemberMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe(`/activity/profile/${userId}`);
		expect(reqs[0].query.range).toBe('7 days');
	});

	it('RCA overview auto-fetch inherits the call range', async () => {
		const ctx = mockApi((req) => {
			if (req.path.startsWith('/activity/profile/')) return profileResponse;
			return { data: { categories: [] } };
		});
		const args = getMemberRcaTool.inputSchema.parse({
			userId,
			variant: 'overview',
			range: '1 year',
		});
		await getMemberRcaTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe(`/activity/profile/${userId}`);
		expect(reqs[0].query.range).toBe('1 year');
	});

	it('skips auto-fetch entirely when projectIds[] is supplied (no profile call)', async () => {
		const ctx = mockApi(() => ({ ok: true }));
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'FTP',
			projectIds: [projectId],
		});
		await getMemberMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		// Only the metric call should fire — no /activity/profile request.
		expect(reqs).toHaveLength(1);
		expect(reqs[0].path).toBe('/activity/ftp');
	});
});
