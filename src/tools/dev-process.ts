import { z } from 'zod';
import { ToolDefinition } from './types';
import { getProjectContext } from '../utils/project-context';

/**
 * Development Process metrics — 8 endpoints unified as one tool.
 *
 * Shared contract:
 *   metric=DEVELOPMENT_PROCESS_SUCCESS_CRITERIA, category=<enum>, range=<enum>, repoIds[]
 * The URL path changes per metric. We map category → path internally.
 *
 * Notes discovered from live testing:
 *   - BE 500s without repoIds + companyId despite spec marking optional; we auto-fetch
 *   - `branch` must be an array (not a string) on at least LINES_OF_CODE+type=graph
 *   - PR_WAIT_TIME has no /details endpoint; includeDetails must be rejected for it
 *   - SIZE_OF_PR /details requires page + limit
 *   - NUMBER_PR_RAISED /details also requires page + limit (BE drift vs spec; observed Apr 2026)
 *   - NUMBER_COMMENTS_ADDED_TO_PRS /details also requires page + limit (same drift)
 *   - DEPLOYMENT_FREQUENCY only returns tableData (no headline/region)
 */

const CATEGORY_TO_PATH: Record<string, string> = {
	CODE_COMMIT_FREQUENCY: 'code-commit',
	LINES_OF_CODE: 'line-of-code',
	NUMBER_COMMENTS_ADDED_TO_PRS: 'pr-comments',
	NUMBER_OF_BRANCHES: 'active-branch',
	NUMBER_PR_RAISED: 'pr',
	PR_WAIT_TIME: 'pr-wait-time',
	DEPLOYMENT_FREQUENCY: 'deployment-frequency',
	SIZE_OF_PR: 'size-of-pr',
};

// Categories the BE exposes a /details endpoint for.
const DETAILS_SUPPORTED: Record<string, boolean> = {
	CODE_COMMIT_FREQUENCY: false,
	LINES_OF_CODE: false,
	NUMBER_COMMENTS_ADDED_TO_PRS: true,
	NUMBER_OF_BRANCHES: true,
	NUMBER_PR_RAISED: true,
	PR_WAIT_TIME: false, // BE returns 404 for /pr-wait-time/details
	DEPLOYMENT_FREQUENCY: true,
	SIZE_OF_PR: true, // requires page + limit
};

const DevProcessInput = z.object({
	projectId: z.string().uuid(),
	category: z
		.enum([
			'CODE_COMMIT_FREQUENCY',
			'LINES_OF_CODE',
			'NUMBER_COMMENTS_ADDED_TO_PRS',
			'NUMBER_OF_BRANCHES',
			'NUMBER_PR_RAISED',
			'PR_WAIT_TIME',
			'DEPLOYMENT_FREQUENCY',
			'SIZE_OF_PR',
		])
		.describe(
			'Which dev-process metric to fetch. CODE_COMMIT_FREQUENCY = avg commits/day, ' +
				'LINES_OF_CODE = LOC added/removed, NUMBER_COMMENTS_ADDED_TO_PRS = PR review activity, ' +
				'NUMBER_OF_BRANCHES = active branch count, NUMBER_PR_RAISED = PR count, ' +
				'PR_WAIT_TIME = hours from open to merge (no /details variant), ' +
				'DEPLOYMENT_FREQUENCY = deploys per period (returns tableData only), ' +
				'SIZE_OF_PR = lines changed per PR. Note: includeDetails=true requires ' +
					'page+limit for SIZE_OF_PR, NUMBER_PR_RAISED, and NUMBER_COMMENTS_ADDED_TO_PRS.'
		),
	range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
	repoIds: z
		.array(z.string())
		.optional()
		.describe('Optional repo IDs. Auto-fetched from the project if omitted.'),
	type: z.enum(['table', 'graph']).optional(),
	branch: z
		.array(z.string())
		.optional()
		.describe(
			'Branch names to filter by. The BE rejects empty `branch[]` for several ' +
				'categories (CODE_COMMIT_FREQUENCY, PR_WAIT_TIME, NUMBER_PR_RAISED, ' +
				'NUMBER_COMMENTS_ADDED_TO_PRS, LINES_OF_CODE+graph). The tool defaults ' +
				'to ["main"] when omitted; pass explicitly only when the project uses ' +
				'a non-main default branch.'
		),
	companyId: z.string().uuid().optional(),
	page: z
		.number()
		.int()
		.min(1)
		.optional()
		.describe('Required for includeDetails on SIZE_OF_PR, NUMBER_PR_RAISED, and NUMBER_COMMENTS_ADDED_TO_PRS.'),
	limit: z
		.number()
		.int()
		.min(1)
		.optional()
		.describe('Required for includeDetails on SIZE_OF_PR, NUMBER_PR_RAISED, and NUMBER_COMMENTS_ADDED_TO_PRS.'),
	includeDetails: z
		.boolean()
		.default(false)
		.describe('Fetch /details variant. Not supported for CODE_COMMIT_FREQUENCY, LINES_OF_CODE, or PR_WAIT_TIME.'),
});

function validateDevProcessArgs(args: z.infer<typeof DevProcessInput>): void {
	if (args.includeDetails && !DETAILS_SUPPORTED[args.category]) {
		throw new Error(
			`pulse_get_dev_process_metric: includeDetails not supported for ${args.category}. ` +
				'Supported: NUMBER_COMMENTS_ADDED_TO_PRS, NUMBER_OF_BRANCHES, NUMBER_PR_RAISED, ' +
				'DEPLOYMENT_FREQUENCY, SIZE_OF_PR.'
		);
	}
	const requiresPageLimit =
		args.category === 'SIZE_OF_PR' ||
		args.category === 'NUMBER_PR_RAISED' ||
		args.category === 'NUMBER_COMMENTS_ADDED_TO_PRS';
	if (args.includeDetails && requiresPageLimit && (!args.page || !args.limit)) {
		throw new Error(
			`pulse_get_dev_process_metric: includeDetails on ${args.category} requires page and limit.`
		);
	}
}

export const getDevProcessMetricTool: ToolDefinition<typeof DevProcessInput> = {
	name: 'pulse_get_dev_process_metric',
	description: 'Fetch a dev-process metric (commits, PRs, deploys, etc.). (See instructions.ts.)',
	inputSchema: DevProcessInput,
	handler: async (args, ctx) => {
		validateDevProcessArgs(args);
		// Spec marks repoIds/companyId optional, but BE 500s without them. Fetch from project
		// context once (cached 5min) and use as fallback.
		const projectCtx = await getProjectContext(ctx.api, args.projectId);
		const segment = CATEGORY_TO_PATH[args.category];
		const path = `/v1/projects/${args.projectId}/metrics/dev-process/${segment}${
			args.includeDetails ? '/details' : ''
		}`;
		const repoIds = args.repoIds && args.repoIds.length > 0 ? args.repoIds : projectCtx.repoIds;
		// BE rejects an empty / missing `branch[]` ("must contain at least 1 elements")
		// for at least: CODE_COMMIT_FREQUENCY, PR_WAIT_TIME, NUMBER_PR_RAISED,
		// NUMBER_COMMENTS_ADDED_TO_PRS, and LINES_OF_CODE+graph. The other
		// categories accept it without complaint. Always default to ['main'] when
		// the caller doesn't supply one — overrideable when a project's default
		// branch differs.
		const branch = args.branch && args.branch.length > 0 ? args.branch : ['main'];
		return ctx.api.request({
			method: 'GET',
			path,
			query: {
				metric: 'DEVELOPMENT_PROCESS_SUCCESS_CRITERIA',
				category: args.category,
				range: args.range,
				type: args.type,
				branch,
				companyId: args.companyId ?? projectCtx.companyId,
				repoIds,
				page: args.page,
				limit: args.limit,
			},
		});
	},
};
