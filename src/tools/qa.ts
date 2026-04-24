import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * QA metrics — 11 endpoints across two clusters.
 *
 * Cluster 1 (core QA): defect-resolution, ftp, reOpenRate.
 *   metric=QA_SUCCESS_CRITERIA, category=<enum>.
 *   DEFECT_RESOLUTION /details variant needs singular `sprintId` (not sprints array).
 *
 * Cluster 2 (RCA): dev-side + qa-side, each with pie-chart / table / trends / details.
 *   Path: /metrics/qa/rca/<side>-<variant>
 *   `trends` additionally requires `type` (bug-category enum) + sprints or versions.
 */

const QA_METRIC = 'QA_SUCCESS_CRITERIA';

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
	sprints: z.array(z.string()).optional().describe('Sprint IDs to filter by (array).'),
	versions: z.array(z.string()).optional(),
	sprintId: z
		.string()
		.optional()
		.describe('Singular sprint ID. Required for DEFECT_RESOLUTION + includeDetails.'),
	priority: z.string().optional().describe('Priority filter (e.g. "High", "Low").'),
	type: z.enum(['table', 'graph']).optional(),
	includeDetails: z
		.boolean()
		.default(false)
		.describe('Only valid for DEFECT_RESOLUTION. Fetches the /details variant.'),
});

export const getQaMetricTool: ToolDefinition<typeof CoreQaInput> = {
	name: 'pulse_get_qa_metric',
	description: 'Core QA metric (FTP, reopen, defect resolution). (See instructions.ts.)',
	inputSchema: CoreQaInput,
	handler: async (args, ctx) => {
		const segment = CORE_CATEGORY_TO_PATH[args.category];
		const canIncludeDetails = args.category === 'DEFECT_RESOLUTION' && args.includeDetails;
		const path = `/projects/${args.projectId}/metrics/qa/${segment}${
			canIncludeDetails ? '/details' : ''
		}`;
		// Details endpoint uses singular sprintId; others use sprints[] / versions[].
		const query = canIncludeDetails
			? {
					metric: QA_METRIC,
					category: args.category,
					sprintId: args.sprintId,
					priority: args.priority,
				}
			: {
					metric: QA_METRIC,
					category: args.category,
					sprints: args.sprints,
					versions: args.versions,
					priority: args.priority,
					type: args.type,
				};
		return ctx.api.request({ method: 'GET', path, query });
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
		.describe('pie-chart | table | trends | details.'),
	sprints: z.array(z.string()).optional(),
	versions: z.array(z.string()).optional(),
	type: z
		.string()
		.optional()
		.describe(
			'Required for variant=trends: a specific bug-category to trend. Examples for ' +
				'side=dev: "Requirement Understanding gap", "Inadequate Unit testing", ' +
				'"Code Review Issues". Examples for side=qa: "Inadequate QA testing", ' +
				'"Inadequate Regression testing", "Test Data issue". Case-sensitive; see BE enum.'
		),
});

export const getQaRcaTool: ToolDefinition<typeof RcaInput> = {
	name: 'pulse_get_qa_rca',
	description: 'QA Root Cause Analysis: dev/qa side, multiple variants. (See instructions.ts.)',
	inputSchema: RcaInput,
	handler: async (args, ctx) => {
		const res = (await ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/qa/rca/${args.side}-${args.variant}`,
			query: {
				sprints: args.sprints,
				versions: args.versions,
				type: args.type,
			},
		})) as { data?: { headline?: { names?: unknown } } } & Record<string, unknown>;
		// BE inconsistency: trends returns headline.names as a string, pie-chart/table
		// return it as an array. Normalise to array so callers can iterate uniformly.
		const names = res?.data?.headline?.names;
		if (typeof names === 'string') {
			return {
				...res,
				data: {
					...res.data,
					headline: { ...res.data?.headline, names: [names] },
				},
			};
		}
		return res;
	},
};
