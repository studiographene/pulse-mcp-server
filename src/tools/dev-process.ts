import { z } from 'zod';
import { ToolDefinition } from './types';
import { getProjectContext } from '../utils/project-context';

/**
 * Development Process metrics (8 endpoints unified as one tool).
 *
 * All dev-process endpoints share the contract:
 *   metric=DEVELOPMENT_PROCESS_SUCCESS_CRITERIA, category={enum}, range={enum}, repoIds[]
 * The URL path changes per metric. We map category → path internally.
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
				'PR_WAIT_TIME = hours from open to merge, DEPLOYMENT_FREQUENCY = deploys per period, ' +
				'SIZE_OF_PR = lines changed per PR.'
		),
	range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
	repoIds: z
		.array(z.string())
		.optional()
		.describe('Optional list of repo IDs to filter by (e.g. ["gh_repo_12345"]).'),
	type: z.enum(['table', 'graph']).optional(),
	branch: z.string().optional(),
	companyId: z.string().uuid().optional(),
	includeDetails: z
		.boolean()
		.default(false)
		.describe('If true, fetch the /details variant with per-entity breakdown.'),
});

export const getDevProcessMetricTool: ToolDefinition<typeof DevProcessInput> = {
	name: 'pulse_get_dev_process_metric',
	description:
		'Fetch a development-process metric for a Pulse project. Covers code commits, lines of ' +
		'code, PR volume/comments/wait-time/size, branch activity, and deployment frequency. ' +
		'Most questions about engineering output, PR health, or delivery pace route here.',
	inputSchema: DevProcessInput,
	handler: async (args, ctx) => {
		// Spec marks repoIds/companyId optional, but the BE 500s without them.
		// Auto-fetch from the project if the caller didn't supply them.
		const needsContext = !args.companyId || !args.repoIds || args.repoIds.length === 0;
		const projectCtx = needsContext ? await getProjectContext(ctx.api, args.projectId) : null;

		const segment = CATEGORY_TO_PATH[args.category];
		const path = `/v1/projects/${args.projectId}/metrics/dev-process/${segment}${
			args.includeDetails ? '/details' : ''
		}`;
		return ctx.api.request({
			method: 'GET',
			path,
			query: {
				metric: 'DEVELOPMENT_PROCESS_SUCCESS_CRITERIA',
				category: args.category,
				range: args.range,
				type: args.type,
				branch: args.branch,
				companyId: args.companyId ?? projectCtx?.companyId,
				repoIds: args.repoIds && args.repoIds.length > 0 ? args.repoIds : projectCtx?.repoIds,
			},
		});
	},
};
