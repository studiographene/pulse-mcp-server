import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * Cycle time — 3 variants across 3 endpoints with different param contracts:
 *   - overall: takes sprints[] / versions[] (both optional for the endpoint, but the
 *     BE frequently 400s without at least one — so callers should provide one)
 *   - summary: same as overall, plus required `type` (graph|table)
 *   - details: takes SINGULAR `sprint` / `version` (string) — the BE rejects the
 *     array forms for this variant
 */

const CycleTimeInput = z.object({
	projectId: z.string().uuid(),
	variant: z
		.enum(['overall', 'summary', 'details'])
		.describe(
			'overall = headline cycle time, summary = breakdown by phase (graph or table), ' +
				'details = per-ticket rows (requires singular sprint or version).'
		),
	type: z
		.enum(['graph', 'table'])
		.optional()
		.describe('Required for variant=summary. Ignored elsewhere.'),
	sprints: z
		.array(z.string())
		.optional()
		.describe('Sprint IDs (array). Used by overall + summary. Ignored by details.'),
	versions: z
		.array(z.string())
		.optional()
		.describe('Version IDs (array). Used by overall + summary. Ignored by details.'),
	sprint: z
		.string()
		.optional()
		.describe('Singular sprint ID. Used by details variant only.'),
	version: z
		.string()
		.optional()
		.describe('Singular version ID. Used by details variant only.'),
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
	sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const getCycleTimeTool: ToolDefinition<typeof CycleTimeInput> = {
	name: 'pulse_get_cycle_time',
	description: 'Cycle time: overall / summary / details variants. (See instructions.ts.)',
	inputSchema: CycleTimeInput,
	handler: async (args, ctx) => {
		const isDetails = args.variant === 'details';
		const query = isDetails
			? {
					sprint: args.sprint,
					version: args.version,
					sortKey: args.sortKey,
					sortOrder: args.sortOrder,
				}
			: {
					type: args.type,
					sprints: args.sprints,
					versions: args.versions,
				};
		return ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/cycle-time/${args.variant}`,
			query,
		});
	},
};
