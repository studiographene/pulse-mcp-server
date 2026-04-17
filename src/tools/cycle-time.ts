import { z } from 'zod';
import { ToolDefinition } from './types';

const CycleTimeInput = z.object({
	projectId: z.string().uuid(),
	variant: z
		.enum(['overall', 'summary', 'details'])
		.describe(
			'overall = headline cycle time number, summary = breakdown (graph or table), ' +
				'details = per-ticket data with sort keys.'
		),
	type: z
		.enum(['graph', 'table'])
		.optional()
		.describe('Required for variant=summary. Ignored elsewhere.'),
	sprints: z.array(z.string()).optional(),
	versions: z.array(z.string()).optional(),
	sprint: z
		.string()
		.optional()
		.describe('Single-sprint filter. Only valid for variant=details.'),
	sortKey: z
		.enum([
			'development.total',
			'qa.total',
			'deployment.total',
			'development.coding',
			'development.pickup',
			'development.handover',
			'development.review',
			'qa.pickup',
			'qa.testing',
			'qa.handover',
		])
		.optional(),
});

export const getCycleTimeTool: ToolDefinition<typeof CycleTimeInput> = {
	name: 'pulse_get_cycle_time',
	description:
		'Fetch cycle-time data for a project. "overall" = single headline figure; ' +
		'"summary" = breakdown by phase (dev / QA / deployment) in graph or table form; ' +
		'"details" = per-ticket cycle-time with optional sort key.',
	inputSchema: CycleTimeInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/cycle-time/${args.variant}`,
			query: {
				type: args.type,
				sprints: args.sprints,
				versions: args.versions,
				sprint: args.sprint,
				sortKey: args.sortKey,
			},
		}),
};
