import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * QA metrics — 11 endpoints across two clusters.
 *
 * Cluster 1 (core QA metrics): defect-resolution, ftp, reOpenRate — share the
 * metric=QA_SUCCESS_CRITERIA / category enum contract.
 *
 * Cluster 2 (RCA — Root Cause Analysis): dev-side + qa-side, each with
 * pie-chart, table, trends, details variants. Sprint/version scoped.
 */

const CORE_CATEGORY_TO_PATH: Record<string, string> = {
	FIRST_TIME_PASS_RATE: 'ftp',
	REOPEN_RATE: 'reOpenRate',
	DEFECT_RESOLUTION: 'defect-resolution',
};

const CoreQaInput = z.object({
	projectId: z.string().uuid(),
	category: z
		.enum(['FIRST_TIME_PASS_RATE', 'REOPEN_RATE', 'DEFECT_RESOLUTION'])
		.describe(
			'Which core QA metric: FIRST_TIME_PASS_RATE (% bugs passing first QA pass), ' +
				'REOPEN_RATE (% of bugs reopened after being closed), DEFECT_RESOLUTION (time to resolve).'
		),
	sprints: z.array(z.string()).optional().describe('Optional sprint IDs to filter by.'),
	versions: z.array(z.string()).optional(),
	priority: z.string().optional().describe('Priority filter (e.g. "High", "Low").'),
	type: z.enum(['table', 'graph']).optional(),
	includeDetails: z
		.boolean()
		.default(false)
		.describe('Only valid for DEFECT_RESOLUTION. Fetches the /details variant.'),
});

export const getQaMetricTool: ToolDefinition<typeof CoreQaInput> = {
	name: 'pulse_get_qa_metric',
	description:
		'Fetch a core QA metric for a project: first-time-pass rate, reopen rate, or defect ' +
		'resolution. Use for questions like "what is the FTP on Drive Fuze this sprint?" or ' +
		'"how long are defects taking to resolve?"',
	inputSchema: CoreQaInput,
	handler: async (args, ctx) => {
		const segment = CORE_CATEGORY_TO_PATH[args.category];
		const canIncludeDetails = args.category === 'DEFECT_RESOLUTION' && args.includeDetails;
		const path = `/projects/${args.projectId}/metrics/qa/${segment}${
			canIncludeDetails ? '/details' : ''
		}`;
		return ctx.api.request({
			method: 'GET',
			path,
			query: {
				metric: 'QA_SUCCESS_CRITERIA',
				category: args.category,
				sprints: args.sprints,
				versions: args.versions,
				priority: args.priority,
				type: args.type,
			},
		});
	},
};

const RcaInput = z.object({
	projectId: z.string().uuid(),
	side: z
		.enum(['dev', 'qa'])
		.describe(
			'Which RCA dataset: "dev" = root causes attributed to development, "qa" = attributed to QA.'
		),
	variant: z
		.enum(['pie-chart', 'table', 'trends', 'details'])
		.describe('How to visualise: pie-chart (breakdown), table (counts), trends (time series), details.'),
	sprints: z.array(z.string()).optional(),
	versions: z.array(z.string()).optional(),
});

export const getQaRcaTool: ToolDefinition<typeof RcaInput> = {
	name: 'pulse_get_qa_rca',
	description:
		'Fetch QA Root Cause Analysis (RCA) data for a project. Returns the distribution or ' +
		'trend of defect root causes, either attributed to Development ("dev" side) or QA ' +
		'("qa" side). Useful for retrospectives and quality conversations.',
	inputSchema: RcaInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/qa/rca/${args.side}-${args.variant}`,
			query: { sprints: args.sprints, versions: args.versions },
		}),
};
