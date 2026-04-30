/* eslint-disable @typescript-eslint/no-explicit-any */
import { getQaMetricTool, getQaRcaTool } from '../src/tools/qa';
import { getEstimatesVsActualsTool } from '../src/tools/pm';
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

const projectId = '22222222-2222-2222-2222-222222222222';
const sprintA = 'sprint-A';
const sprintB = 'sprint-B';
const sprintC = 'sprint-C';

function mockBoardsResponse() {
	return {
		data: {
			boards: [
				{
					sprints: [
						{ id: sprintA, startDate: '2026-04-01' },
						{ id: sprintB, startDate: '2026-03-15' },
						{ id: sprintC, startDate: '2026-03-01' },
					],
				},
			],
		},
	};
}

describe('pulse_get_qa_metric — sprint auto-fetch', () => {
	it('auto-fills the 3 most recent sprints when none supplied', async () => {
		const ctx = mockApi((req) => {
			if (req.path.endsWith('/jira/boards')) return mockBoardsResponse();
			return { data: { headline: 0.78 } };
		});
		const args = getQaMetricTool.inputSchema.parse({
			projectId,
			category: 'FIRST_TIME_PASS_RATE',
		});
		const res = await getQaMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe(`/projects/${projectId}/jira/boards`);
		expect(reqs[1].query.sprints).toEqual([sprintA, sprintB, sprintC]);
		expect((res as any)._autoFilledSprints).toEqual([sprintA, sprintB, sprintC]);
	});

	it('skips auto-fetch when sprints[] is supplied', async () => {
		const ctx = mockApi(() => ({ data: {} }));
		const args = getQaMetricTool.inputSchema.parse({
			projectId,
			category: 'FIRST_TIME_PASS_RATE',
			sprints: ['user-sprint'],
		});
		const res = await getQaMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs).toHaveLength(1);
		expect(reqs[0].query.sprints).toEqual(['user-sprint']);
		expect((res as any)._autoFilledSprints).toBeUndefined();
	});

	it('skips auto-fetch when versions[] is supplied', async () => {
		const ctx = mockApi(() => ({ data: {} }));
		const args = getQaMetricTool.inputSchema.parse({
			projectId,
			category: 'FIRST_TIME_PASS_RATE',
			versions: ['v1.0'],
		});
		await getQaMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs).toHaveLength(1);
		expect(reqs[0].query.versions).toEqual(['v1.0']);
	});

	it('skips auto-fetch on DEFECT_RESOLUTION + includeDetails (singular sprintId)', async () => {
		const ctx = mockApi(() => ({ data: {} }));
		const args = getQaMetricTool.inputSchema.parse({
			projectId,
			category: 'DEFECT_RESOLUTION',
			includeDetails: true,
			sprintId: 'specific-sprint',
		});
		await getQaMetricTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs).toHaveLength(1);
		expect(reqs[0].query.sprintId).toBe('specific-sprint');
	});
});

describe('pulse_get_qa_rca — sprint auto-fetch', () => {
	it('auto-fills 3 sprints when none supplied', async () => {
		const ctx = mockApi((req) => {
			if (req.path.endsWith('/jira/boards')) return mockBoardsResponse();
			return { data: {} };
		});
		const args = getQaRcaTool.inputSchema.parse({
			projectId,
			side: 'dev',
			variant: 'pie-chart',
		});
		const res = await getQaRcaTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe(`/projects/${projectId}/jira/boards`);
		expect(reqs[1].query.sprints).toEqual([sprintA, sprintB, sprintC]);
		expect((res as any)._autoFilledSprints).toEqual([sprintA, sprintB, sprintC]);
	});
});

describe('pulse_get_estimates_vs_actuals — sprint auto-fetch', () => {
	it('auto-fills the most recent sprint when none supplied', async () => {
		const ctx = mockApi((req) => {
			if (req.path.endsWith('/jira/boards')) return mockBoardsResponse();
			return { data: {} };
		});
		const args = getEstimatesVsActualsTool.inputSchema.parse({ projectId });
		const res = await getEstimatesVsActualsTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs[0].path).toBe(`/projects/${projectId}/jira/boards`);
		expect(reqs[1].query.sprint).toBe(sprintA);
		expect((res as any)._autoFilledSprint).toBe(sprintA);
	});

	it('skips auto-fetch when caller supplies sprint', async () => {
		const ctx = mockApi(() => ({ data: {} }));
		const args = getEstimatesVsActualsTool.inputSchema.parse({
			projectId,
			sprint: 'user-pick',
		});
		await getEstimatesVsActualsTool.handler(args, ctx);
		const reqs = (ctx.api as any).__requests;
		expect(reqs).toHaveLength(1);
		expect(reqs[0].query.sprint).toBe('user-pick');
	});
});
