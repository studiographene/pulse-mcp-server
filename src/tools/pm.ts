import { z } from 'zod';
import { ToolDefinition } from './types';
import { recentSprintIds } from '../utils/sprint-context';

/**
 * PM metrics — 3 clusters: headline PM, estimates-vs-actuals, work-breakdown (graph/trends).
 *
 * Time-spent was previously exposed as pulse_get_time_spent but the underlying BE
 * feature was shelved (all variants 501 behind the `time_spent_feature` Statsig flag
 * with no plans to ship). Tool removed to avoid tempting Claude to call something
 * that will never work.
 */

const PM_METRIC = 'PM_SUCCESS_CRITERIA';

const PmHeadlineInput = z.object({
	projectId: z.string().uuid(),
	category: z
		.enum(['ESTIMATES_VS_ACTUALS'])
		.describe('Top-level PM metric. (TIME_SPENT removed — feature shelved on BE.)'),
	type: z
		.enum(['sprint', 'version'])
		.default('sprint')
		.describe('Required: aggregate by sprint or by release version.'),
	range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
	sortKey: z.enum(['estimate', 'actual']).optional(),
	sortOrder: z.enum(['asc', 'desc']).optional(),
	sprintState: z.enum(['active', 'closed']).optional(),
	versionState: z.enum(['all', 'released', 'unreleased']).optional(),
	page: z.number().int().min(1).optional(),
	limit: z.number().int().min(1).optional(),
	v2: z
		.boolean()
		.default(false)
		.describe('If true, use the /v2 endpoint variant (newer response shape).'),
});

export const getPmMetricTool: ToolDefinition<typeof PmHeadlineInput> = {
	name: 'pulse_get_pm_metric',
	description: 'Headline PM metric (estimates-vs-actuals or time-spent). (See instructions.ts.)',
	inputSchema: PmHeadlineInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/pm${args.v2 ? '/v2' : ''}`,
			query: {
				metric: PM_METRIC,
				category: args.category,
				type: args.type,
				range: args.range,
				sortKey: args.sortKey,
				sortOrder: args.sortOrder,
				sprintState: args.sprintState,
				versionState: args.versionState,
				page: args.page,
				limit: args.limit,
			},
		}),
};

const EstimatesVsActualsInput = z.object({
	projectId: z.string().uuid(),
	sprint: z.string().optional(),
	sortKey: z.enum(['estimate', 'actual']).optional(),
	sortOrder: z.enum(['asc', 'desc']).optional(),
	sprintState: z.enum(['active', 'closed']).optional(),
	versionState: z.enum(['all', 'released', 'unreleased']).optional(),
	v2: z.boolean().default(false),
});

export const getEstimatesVsActualsTool: ToolDefinition<typeof EstimatesVsActualsInput> = {
	name: 'pulse_get_estimates_vs_actuals',
	description: 'Per-ticket estimates vs actuals, sprint-scoped. (See instructions.ts.)',
	inputSchema: EstimatesVsActualsInput,
	handler: async (args, ctx) => {
		// Auto-fill the most-recent sprint if the caller didn't pick one.
		// BE returns empty when sprint is missing; FE always supplies via UI.
		const autoSprint = !args.sprint
			? (await recentSprintIds(ctx.api, args.projectId, 1))[0]
			: undefined;
		const res = await ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/pm/estimates-vs-actuals${
				args.v2 ? '/v2' : ''
			}`,
			query: {
				sprint: autoSprint ?? args.sprint,
				sortKey: args.sortKey,
				sortOrder: args.sortOrder,
				sprintState: args.sprintState,
				versionState: args.versionState,
			},
		});
		return autoSprint
			? { ...(res as Record<string, unknown>), _autoFilledSprint: autoSprint }
			: res;
	},
};


const WorkBreakdownInput = z.object({
	projectId: z.string().uuid(),
	variant: z.enum(['graph', 'trends']),
	range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
	repoIds: z.array(z.string()).optional(),
});

export const getWorkBreakdownTool: ToolDefinition<typeof WorkBreakdownInput> = {
	name: 'pulse_get_work_breakdown',
	description: 'Work breakdown distribution graph or trend. (See instructions.ts.)',
	inputSchema: WorkBreakdownInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/pm/workbreakdown/${args.variant}`,
			query: {
				metric: PM_METRIC,
				category: 'WORK_BREAKDOWN',
				range: args.range,
				repoIds: args.repoIds,
			},
		}),
};
