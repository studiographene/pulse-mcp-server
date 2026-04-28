/* eslint-disable @typescript-eslint/no-explicit-any */
import { getMemberMetricTool, getMemberRcaTool } from '../src/tools/activity';
import { ToolContext } from '../src/tools/types';

function mockApi(handler: (req: any) => unknown): ToolContext {
	const requests: any[] = [];
	return {
		api: {
			request: async (req: any) => {
				requests.push(req);
				return handler(req);
			},
			// expose for assertions
			__requests: requests,
		} as any,
	};
}

describe('pulse_get_member_metric', () => {
	const userId = '11111111-1111-1111-1111-111111111111';
	const projectId = '22222222-2222-2222-2222-222222222222';

	it('routes CODE_COMMIT to /activity/code-commit', async () => {
		const ctx = mockApi(() => ({ ok: true }));
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'CODE_COMMIT',
		});
		await getMemberMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe('/activity/code-commit');
		expect(reqs[0].query.userId).toBe(userId);
		expect(reqs[0].query.range).toBe('30 days');
	});

	it('routes FTP to /activity/ftp and auto-fetches projectIds when missing', async () => {
		const ctx = mockApi((req) => {
			if (req.path.startsWith('/activity/profile/')) {
				return { data: { projects: [{ id: projectId }] } };
			}
			return { rate: 0.78 };
		});
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'FTP',
		});
		await getMemberMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe(`/activity/profile/${userId}`); // auto-fetch step
		expect(reqs[1].path).toBe('/activity/ftp');
		expect(reqs[1].query.projectIds).toEqual([projectId]);
	});

	it('routes PR_COMMENTS + includeDetails to /activity/pr-comments/details', async () => {
		const ctx = mockApi(() => ({ rows: [] }));
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'PR_COMMENTS',
			includeDetails: true,
			page: 1,
			limit: 25,
		});
		await getMemberMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe('/activity/pr-comments/details');
		expect(reqs[0].query.page).toBe(1);
		expect(reqs[0].query.limit).toBe(25);
	});

	it('rejects PR_COMMENTS + includeDetails when page/limit missing', async () => {
		const ctx = mockApi(() => ({ rows: [] }));
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'PR_COMMENTS',
			includeDetails: true,
		});
		await expect(getMemberMetricTool.handler(args, ctx)).rejects.toThrow(/page \+ limit/);
	});

	it('uses customRange[] when supplied (range is suppressed)', async () => {
		const ctx = mockApi(() => ({ ok: true }));
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'PR',
			customRange: ['2026-01-01', '2026-03-31'],
		});
		await getMemberMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].query.range).toBeUndefined();
		expect(reqs[0].query.customRange).toEqual(['2026-01-01', '2026-03-31']);
	});
});

describe('pulse_get_member_rca', () => {
	const userId = '11111111-1111-1111-1111-111111111111';
	const projectId = '22222222-2222-2222-2222-222222222222';

	it('defaults variant to overview', async () => {
		const ctx = mockApi(() => ({ ok: true }));
		const args = getMemberRcaTool.inputSchema.parse({
			userId,
			projectIds: [projectId],
		});
		await getMemberRcaTool.handler(args, ctx);
		expect((ctx.api as any).__requests[0].path).toBe('/activity/rca');
	});

	it('routes details and trends to the right paths', async () => {
		const ctxDetails = mockApi(() => ({ ok: true }));
		await getMemberRcaTool.handler(
			getMemberRcaTool.inputSchema.parse({
				userId,
				projectIds: [projectId],
				variant: 'details',
			}),
			ctxDetails
		);
		expect((ctxDetails.api as any).__requests[0].path).toBe('/activity/rca/details');

		const ctxTrends = mockApi(() => ({ ok: true }));
		await getMemberRcaTool.handler(
			getMemberRcaTool.inputSchema.parse({
				userId,
				projectIds: [projectId],
				variant: 'trends',
				category: 'Inadequate Unit testing',
			}),
			ctxTrends
		);
		expect((ctxTrends.api as any).__requests[0].path).toBe('/activity/rca/trends');
		expect((ctxTrends.api as any).__requests[0].query.category).toBe('Inadequate Unit testing');
	});

	it('rejects variant=trends without category at parse time', () => {
		expect(() =>
			getMemberRcaTool.inputSchema.parse({
				userId,
				projectIds: [projectId],
				variant: 'trends',
			})
		).toThrow(/category/);
	});

	it('auto-fetches projectIds when only userId is given', async () => {
		const ctx = mockApi((req) => {
			if (req.path.startsWith('/activity/profile/')) {
				return { data: { projects: [{ id: projectId }] } };
			}
			return { ok: true };
		});
		await getMemberRcaTool.handler(
			getMemberRcaTool.inputSchema.parse({ userId }),
			ctx
		);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe(`/activity/profile/${userId}`);
		expect(reqs[1].query.projectIds).toEqual([projectId]);
	});

	it('throws if projectIds is required but cannot be auto-fetched', async () => {
		const ctx = mockApi(() => ({ data: { projects: [] } }));
		await expect(
			getMemberRcaTool.handler(getMemberRcaTool.inputSchema.parse({ userId }), ctx)
		).rejects.toThrow(/projectIds\[\] is required/);
	});
});
