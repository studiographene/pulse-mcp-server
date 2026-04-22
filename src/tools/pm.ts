import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * PM metrics — 9 endpoints across three clusters: headline PM, estimates-vs-actuals,
 * time-spent (table/pie/trend/headline), work-breakdown (graph/trends).
 *
 * NOTE: pulse_get_time_spent currently returns 501 "Feature Under Development" from
 * the Pulse BE regardless of params. The tool is kept for MCP schema completeness
 * (and in case the BE implements it later) but callers should not expect success.
 */

const PM_METRIC = 'PM_SUCCESS_CRITERIA';

const PmHeadlineInput = z.object({
	projectId: z.string().uuid(),
	category: z
		.enum(['ESTIMATES_VS_ACTUALS', 'TIME_SPENT'])
		.describe('Top-level PM metric: planned-vs-actual effort, or raw time spent.'),
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
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/pm/estimates-vs-actuals${
				args.v2 ? '/v2' : ''
			}`,
			query: {
				sprint: args.sprint,
				sortKey: args.sortKey,
				sortOrder: args.sortOrder,
				sprintState: args.sprintState,
				versionState: args.versionState,
			},
		}),
};

const TimeSpentInput = z.object({
	projectId: z.string().uuid(),
	variant: z
		.enum(['headline', 'pie-chart', 'table', 'trend'])
		.describe(
			'Which time-spent view: headline (totals), pie-chart (by category), ' +
				'table (per-person/ticket), trend (over time).'
		),
	range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
	page: z.number().int().min(1).optional().describe('Required for variant=table.'),
	limit: z.number().int().min(1).optional().describe('Required for variant=table.'),
});

export const getTimeSpentTool: ToolDefinition<typeof TimeSpentInput> = {
	name: 'pulse_get_time_spent',
	description:
		'Time-spent breakdown (headline / pie / table / trend). NOTE: Pulse BE currently ' +
		'returns 501 Feature Under Development for this endpoint family. Tool preserved in ' +
		"case BE is implemented later. (See instructions.ts.)",
	inputSchema: TimeSpentInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/pm/time-spent/${args.variant}`,
			query: {
				metric: PM_METRIC,
				category: 'TIME_SPENT',
				range: args.range,
				page: args.page,
				limit: args.limit,
			},
		}),
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
