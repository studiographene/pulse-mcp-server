/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDevProcessMetricTool } from '../src/tools/dev-process';
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

const projectId = '11111111-1111-1111-1111-111111111111';
const repoId = 'gh_repo_12345';

function mockProjectResponse() {
	return {
		data: {
			id: projectId,
			companyId: 'company-1',
			tools: [
				{
					name: 'GITHUB',
					meta: [{ integratorId: repoId }],
				},
			],
		},
	};
}

function mockCtx() {
	return mockApi((req) => {
		if (req.path.startsWith(`/projects/${projectId}`)) {
			return mockProjectResponse();
		}
		return { data: { headline: { value: 1 } } };
	});
}

describe('pulse_get_dev_process_metric — branch default', () => {
	const REPO_SCOPED_CATEGORIES = [
		'CODE_COMMIT_FREQUENCY',
		'PR_WAIT_TIME',
		'NUMBER_PR_RAISED',
		'NUMBER_COMMENTS_ADDED_TO_PRS',
		'LINES_OF_CODE',
		'NUMBER_OF_BRANCHES',
		'SIZE_OF_PR',
		'DEPLOYMENT_FREQUENCY',
	] as const;

	it.each(REPO_SCOPED_CATEGORIES)(
		'auto-fills branch=["main"] for %s when caller omits it',
		async (category) => {
			const ctx = mockCtx();
			const args = getDevProcessMetricTool.inputSchema.parse({
				projectId,
				category,
			});
			await getDevProcessMetricTool.handler(args, ctx);
			const reqs = (ctx.api as any).__requests;
			// reqs[0] is the project-context fetch; reqs[1] is the metric call.
			const metricCall = reqs.find((r: any) => r.path.includes('/metrics/'));
			expect(metricCall).toBeDefined();
			expect(metricCall.query.branch).toEqual(['main']);
		}
	);

	it('respects an explicit branch override', async () => {
		const ctx = mockCtx();
		const args = getDevProcessMetricTool.inputSchema.parse({
			projectId,
			category: 'CODE_COMMIT_FREQUENCY',
			branch: ['develop', 'release'],
		});
		await getDevProcessMetricTool.handler(args, ctx);
		const metricCall = (ctx.api as any).__requests.find((r: any) =>
			r.path.includes('/metrics/')
		);
		expect(metricCall.query.branch).toEqual(['develop', 'release']);
	});

	it('treats an empty branch[] as "no branch supplied" and applies the default', async () => {
		const ctx = mockCtx();
		const args = getDevProcessMetricTool.inputSchema.parse({
			projectId,
			category: 'NUMBER_PR_RAISED',
			branch: [],
		});
		await getDevProcessMetricTool.handler(args, ctx);
		const metricCall = (ctx.api as any).__requests.find((r: any) =>
			r.path.includes('/metrics/')
		);
		expect(metricCall.query.branch).toEqual(['main']);
	});
});
