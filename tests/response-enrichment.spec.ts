/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Regression cover for response-enrichment blocks added to help LLM consumers
 * cite what they actually queried. Four blocks under test:
 *
 *   1. `_scope` on pulse_get_member_metric and pulse_get_member_rca — what
 *      user, projects, repos, window did we actually hit, and was the scope
 *      passed explicitly or auto-fetched from the profile.
 *   2. `_byProject` on pulse_get_member_rca (overview only, multi-project) —
 *      per-project totals so callers can distinguish "filter binds, project
 *      contributes zero" from "filter broken".
 *   3. `_meta.sprintIdNote` on pulse_get_member_rca — flags that the shared
 *      `sprintId` on tableData rows is FE-nav metadata, not query scope.
 *   4. `_windowCovered` on pulse_get_qa_metric and pulse_get_qa_rca — the
 *      calendar range covered by the auto-filled sprints, so cross-tool
 *      comparisons don't silently mismatch windows.
 */

import { getMemberMetricTool, getMemberRcaTool } from '../src/tools/activity';
import { getQaMetricTool, getQaRcaTool } from '../src/tools/qa';
import { ToolContext } from '../src/tools/types';

function mockApi(handler: (req: any) => unknown): {
	ctx: ToolContext;
	requests: any[];
} {
	const requests: any[] = [];
	return {
		requests,
		ctx: {
			api: {
				request: async (req: any) => {
					requests.push(req);
					return handler(req);
				},
			} as any,
		},
	};
}

const userId = '11111111-1111-1111-1111-111111111111';
const projectA = '22222222-2222-2222-2222-222222222222';
const projectB = '33333333-3333-3333-3333-333333333333';
const projectC = '44444444-4444-4444-4444-444444444444';
const repoA = 'gh_repo_1000';
const projectAName = 'Locaria T&M';
const projectBName = 'CTL Communications';

const profileResponse = {
	data: {
		projects: [
			{ id: projectA, name: projectAName, repositories: [{ id: repoA }] },
			{ id: projectB, name: projectBName, repositories: [] },
		],
	},
};

describe('_scope block on pulse_get_member_metric', () => {
	it('includes user, window, projects (with names + source=auto-fetched), and repos', async () => {
		const { ctx, requests } = mockApi((req) => {
			if (req.path.startsWith('/activity/profile/')) return profileResponse;
			return { data: { headline: {}, graphData: [] } };
		});
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'CODE_COMMIT',
			customRange: ['2026-01-01', '2026-06-30'],
		});
		const res = (await getMemberMetricTool.handler(args, ctx)) as any;
		expect(res._scope).toBeDefined();
		expect(res._scope.userId).toBe(userId);
		expect(res._scope.window).toEqual({ customRange: ['2026-01-01', '2026-06-30'] });
		expect(res._scope.projects).toEqual([
			{ id: projectA, name: projectAName, source: 'auto-fetched' },
			{ id: projectB, name: projectBName, source: 'auto-fetched' },
		]);
		expect(res._scope.repos).toEqual([{ id: repoA, source: 'auto-fetched' }]);
		expect(res._scope.note).toContain('PX-3537');
		// Sanity: profile call fired for auto-fetch.
		expect(requests[0].path).toBe(`/activity/profile/${userId}`);
	});

	it("marks source='passed' when projectIds/repoIds are supplied explicitly (no note)", async () => {
		const { ctx } = mockApi(() => ({ data: { headline: {}, graphData: [] } }));
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'FTP',
			projectIds: [projectA],
		});
		const res = (await getMemberMetricTool.handler(args, ctx)) as any;
		expect(res._scope.projects).toEqual([
			{ id: projectA, name: undefined, source: 'passed' },
		]);
		// FTP is project-scoped, not repo-scoped, so no repos block.
		expect(res._scope.repos).toBeUndefined();
		// Note only appears when at least one scope was auto-fetched.
		expect(res._scope.note).toBeUndefined();
	});

	it("uses default range='30 days' in window when neither range nor customRange provided", async () => {
		const { ctx } = mockApi(() => ({ data: { headline: {}, graphData: [] } }));
		const args = getMemberMetricTool.inputSchema.parse({
			userId,
			category: 'FTP',
			projectIds: [projectA],
		});
		const res = (await getMemberMetricTool.handler(args, ctx)) as any;
		expect(res._scope.window).toEqual({ range: '30 days' });
	});
});

describe('_scope + _byProject + _meta on pulse_get_member_rca', () => {
	it("adds _byProject when multiple projects (<=5) and variant='overview'", async () => {
		const perProject: Record<string, number> = {
			[projectA]: 60,
			[projectB]: 0,
		};
		let callCount = 0;
		const { ctx, requests } = mockApi((req) => {
			callCount += 1;
			if (req.path.startsWith('/activity/profile/')) return profileResponse;
			const ids: string[] = req.query.projectIds;
			// Aggregate (multi-project) call vs single-project fan-out calls both
			// share the same endpoint; distinguish by projectIds length.
			const total = ids.length === 1 ? perProject[ids[0]] : 60;
			return {
				data: { headline: { totalBugs: total }, tableData: [], graphData: [] },
			};
		});
		const args = getMemberRcaTool.inputSchema.parse({
			userId,
			projectIds: [projectA, projectB],
			customRange: ['2026-01-01', '2026-06-30'],
			variant: 'overview',
		});
		const res = (await getMemberRcaTool.handler(args, ctx)) as any;

		expect(res._byProject).toBeDefined();
		// Sorted by totalBugs desc.
		expect(res._byProject).toEqual([
			{ projectId: projectA, projectName: undefined, totalBugs: 60 },
			{ projectId: projectB, projectName: undefined, totalBugs: 0 },
		]);
		expect(res._byProjectNote).toBeUndefined();
		// 1 aggregate + 2 per-project = 3 RCA calls total (no profile call since
		// projectIds passed explicitly).
		expect(callCount).toBe(3);
		expect(res._meta.sprintIdNote).toContain('per-row navigation metadata');
		expect(res._scope.projects).toEqual([
			{ id: projectA, name: undefined, source: 'passed' },
			{ id: projectB, name: undefined, source: 'passed' },
		]);
		// _scope.window reflects customRange
		expect(res._scope.window).toEqual({ customRange: ['2026-01-01', '2026-06-30'] });
		// Make sure the fan-out fired the aggregate + N per-project calls.
		const rcaRequests = requests.filter(
			(r) => r.path === '/activity/rca'
		);
		expect(rcaRequests).toHaveLength(3);
	});

	it('skips _byProject when only one project is queried', async () => {
		const { ctx } = mockApi(() => ({
			data: { headline: { totalBugs: 42 }, tableData: [], graphData: [] },
		}));
		const args = getMemberRcaTool.inputSchema.parse({
			userId,
			projectIds: [projectA],
			variant: 'overview',
		});
		const res = (await getMemberRcaTool.handler(args, ctx)) as any;
		expect(res._byProject).toBeUndefined();
		expect(res._byProjectNote).toBeUndefined();
	});

	it("skips _byProject and attaches _byProjectNote when > 5 projects", async () => {
		const projects = Array.from(
			{ length: 6 },
			(_, i) => `55555555-5555-5555-5555-55555555555${i}`
		);
		let callCount = 0;
		const { ctx } = mockApi(() => {
			callCount += 1;
			return {
				data: { headline: { totalBugs: 10 }, tableData: [], graphData: [] },
			};
		});
		const args = getMemberRcaTool.inputSchema.parse({
			userId,
			projectIds: projects,
			variant: 'overview',
		});
		const res = (await getMemberRcaTool.handler(args, ctx)) as any;
		expect(res._byProject).toBeUndefined();
		expect(res._byProjectNote).toContain('6 projects passed');
		// Only the aggregate call — no fan-out.
		expect(callCount).toBe(1);
	});

	it("skips _byProject for variant='details' and variant='trends'", async () => {
		let callCount = 0;
		const { ctx } = mockApi(() => {
			callCount += 1;
			return { data: { rows: [] } };
		});
		const args = getMemberRcaTool.inputSchema.parse({
			userId,
			projectIds: [projectA, projectB],
			variant: 'details',
		});
		const res = (await getMemberRcaTool.handler(args, ctx)) as any;
		expect(res._byProject).toBeUndefined();
		expect(callCount).toBe(1); // only the main call
		expect(res._meta.sprintIdNote).toBeDefined(); // meta still added
	});
});

describe('_windowCovered on QA tools', () => {
	const projectId = '99999999-9999-9999-9999-999999999999';
	const boardsResponse = {
		data: {
			boards: [
				{
					sprints: [
						{
							id: 'jira_sprint_9572',
							name: 'Adaptria v3 - Sprint 6',
							startDate: '2026-06-02T08:44:29.222Z',
							endDate: '2026-06-15T22:30:00.000Z',
						},
						{
							id: 'jira_sprint_9440',
							name: 'Adaptria v3 - Sprint 5',
							startDate: '2026-05-19T08:34:31.307Z',
							endDate: '2026-06-01T22:30:00.000Z',
						},
						{
							id: 'jira_sprint_9275',
							name: 'Adaptria v3 - Sprint 4',
							startDate: '2026-05-05T08:00:46.154Z',
							endDate: '2026-05-18T22:30:00.000Z',
						},
					],
				},
			],
		},
	};

	it('surfaces the calendar window covered by auto-filled sprints on qa_metric', async () => {
		const { ctx } = mockApi((req) => {
			if (req.path.endsWith('/jira/boards')) return boardsResponse;
			return { data: { headline: {}, graphData: [] } };
		});
		const args = getQaMetricTool.inputSchema.parse({
			projectId,
			category: 'FIRST_TIME_PASS_RATE',
		});
		const res = (await getQaMetricTool.handler(args, ctx)) as any;
		expect(res._autoFilledSprints).toEqual([
			'jira_sprint_9572',
			'jira_sprint_9440',
			'jira_sprint_9275',
		]);
		expect(res._windowCovered).toBeDefined();
		expect(res._windowCovered.startDate).toBe('2026-05-05');
		expect(res._windowCovered.endDate).toBe('2026-06-15');
		expect(res._windowCovered.sprintCount).toBe(3);
		expect(res._windowCovered.note).toContain('sprint-scoped');
	});

	it("does NOT attach _windowCovered when sprints[] is passed explicitly", async () => {
		const { ctx } = mockApi(() => ({ data: { headline: {}, graphData: [] } }));
		const args = getQaMetricTool.inputSchema.parse({
			projectId,
			category: 'FIRST_TIME_PASS_RATE',
			sprints: ['jira_sprint_1', 'jira_sprint_2'],
		});
		const res = (await getQaMetricTool.handler(args, ctx)) as any;
		expect(res._windowCovered).toBeUndefined();
		expect(res._autoFilledSprints).toBeUndefined();
	});

	it('surfaces the calendar window covered by auto-filled sprints on qa_rca', async () => {
		const { ctx } = mockApi((req) => {
			if (req.path.endsWith('/jira/boards')) return boardsResponse;
			return { data: { headline: { names: [] }, tableData: [] } };
		});
		const args = getQaRcaTool.inputSchema.parse({
			projectId,
			side: 'dev',
			variant: 'pie-chart',
		});
		const res = (await getQaRcaTool.handler(args, ctx)) as any;
		expect(res._windowCovered).toBeDefined();
		expect(res._windowCovered.startDate).toBe('2026-05-05');
		expect(res._windowCovered.endDate).toBe('2026-06-15');
		expect(res._windowCovered.sprintCount).toBe(3);
	});
});
