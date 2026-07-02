import { z } from 'zod';
import { ToolDefinition } from './types';
import { recentSprintInfos, sprintsWindow, type SprintInfo } from '../utils/sprint-context';

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

type CoreQaArgs = z.infer<typeof CoreQaInput>;

type QaQuery = Record<string, string | number | boolean | string[] | undefined>;

function buildQaMetricQuery(
	args: CoreQaArgs,
	canIncludeDetails: boolean,
	autoSprints: string[] | undefined
): QaQuery {
	if (canIncludeDetails) {
		return {
			metric: QA_METRIC,
			category: args.category,
			sprintId: args.sprintId,
			priority: args.priority,
		};
	}
	return {
		metric: QA_METRIC,
		category: args.category,
		sprints: autoSprints ?? args.sprints,
		versions: args.versions,
		priority: args.priority,
		type: args.type,
	};
}

/**
 * Walks a QA metric response and counts how many of the per-sprint
 * `graphData` rows actually carried data (i.e. were not GREY-regioned for
 * having zero tagged work). Lets a caller see when a headline like
 * "93.33% AMBER" is derived from just 1 of 3 sprints — see Cowork
 * feedback 2026-05-14, issue #11.
 *
 * Returns null when the response has no `graphData` shape we can reason
 * about (some categories don't carry per-sprint rows).
 */
function summariseSprintCoverage(
	res: unknown
): { contributing: number; total: number; greyed: string[] } | null {
	const graphData = (
		res as { data?: { graphData?: unknown } } | undefined
	)?.data?.graphData;
	if (!Array.isArray(graphData) || graphData.length === 0) return null;
	const rows = graphData as Array<{
		region?: string;
		total?: number;
		sprintName?: string;
	}>;
	const greyed: string[] = [];
	let contributing = 0;
	for (const row of rows) {
		const hasData =
			(row.total ?? 0) > 0 ||
			(row.region !== undefined && row.region !== 'GREY');
		if (hasData) {
			contributing += 1;
		} else if (row.sprintName) {
			greyed.push(row.sprintName);
		}
	}
	return { contributing, total: rows.length, greyed };
}

/**
 * Note attached to any sprint-scoped QA response so LLM consumers know the
 * endpoint isn't date-scoped, and how the auto-filled window compares to
 * whatever date range they might be discussing.
 */
const SPRINT_SCOPED_NOTE =
	'This endpoint is sprint-scoped, NOT date-scoped: it does not accept range / customRange. ' +
	'When comparing against individual-level metrics (which use date windows), the two may not ' +
	'be like-for-like — the auto-filled sprint window in `_windowCovered` shows what calendar ' +
	'range actually got queried. To widen, enumerate sprints via `pulse_list_project_sprints` ' +
	'and pass sprints[] explicitly.';

interface WindowCoveredBlock {
	startDate: string;
	endDate: string;
	sprintCount: number;
	note: string;
}

function windowCoveredFrom(
	sprints: SprintInfo[] | undefined
): WindowCoveredBlock | undefined {
	if (!sprints || sprints.length === 0) return undefined;
	const window = sprintsWindow(sprints);
	if (!window) return undefined;
	return {
		startDate: window.startDate,
		endDate: window.endDate,
		sprintCount: sprints.length,
		note: SPRINT_SCOPED_NOTE,
	};
}

/** True iff neither sprints[] nor versions[] was supplied. */
function needsSprintAutoFill(args: CoreQaArgs): boolean {
	const noSprints = !args.sprints || args.sprints.length === 0;
	const noVersions = !args.versions || args.versions.length === 0;
	return noSprints && noVersions;
}

export const getQaMetricTool: ToolDefinition<typeof CoreQaInput> = {
	name: 'pulse_get_qa_metric',
	description:
		'Core QA metric (FTP, reopen, defect resolution). Sprint-scoped: does not accept ' +
		'range/customRange. When sprints[] is omitted, defaults to the 3 most recent ' +
		'meaningful sprints; the calendar window covered is surfaced in `_windowCovered` ' +
		'on the response so callers can compare against date-scoped individual metrics. ' +
		'(See instructions.ts.)',
	inputSchema: CoreQaInput,
	handler: async (args, ctx) => {
		const segment = CORE_CATEGORY_TO_PATH[args.category];
		const canIncludeDetails = args.category === 'DEFECT_RESOLUTION' && args.includeDetails;
		const path = `/projects/${args.projectId}/metrics/qa/${segment}${
			canIncludeDetails ? '/details' : ''
		}`;
		// Auto-fill sprints[] when neither sprints nor versions is supplied — the
		// BE silent-empties otherwise. Default to the 3 most recent sprints,
		// matching the cycle-time tool's behaviour. Skipped for the DEFECT_RESOLUTION
		// /details path which uses singular sprintId.
		const autoSprintInfos =
			!canIncludeDetails && needsSprintAutoFill(args)
				? await recentSprintInfos(ctx.api, args.projectId, 3)
				: undefined;
		const autoSprints = autoSprintInfos?.map((s) => s.id);
		const res = await ctx.api.request({
			method: 'GET',
			path,
			query: buildQaMetricQuery(args, canIncludeDetails, autoSprints),
		});
		const coverage = summariseSprintCoverage(res);
		const windowCovered = windowCoveredFrom(autoSprintInfos);
		return {
			...(res as Record<string, unknown>),
			...(autoSprints ? { _autoFilledSprints: autoSprints } : {}),
			...(coverage ? { _contributingSprints: coverage } : {}),
			...(windowCovered ? { _windowCovered: windowCovered } : {}),
		};
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

type RcaRes = { data?: { headline?: { names?: unknown } } } & Record<string, unknown>;

/**
 * BE inconsistency: `trends` returns `headline.names` as a string,
 * `pie-chart`/`table` return it as an array. Normalise to array so callers
 * can iterate uniformly.
 */
function normaliseRcaNames(res: RcaRes): RcaRes {
	const names = res?.data?.headline?.names;
	if (typeof names !== 'string') return res;
	return {
		...res,
		data: {
			...res.data,
			headline: { ...res.data?.headline, names: [names] },
		},
	};
}

export const getQaRcaTool: ToolDefinition<typeof RcaInput> = {
	name: 'pulse_get_qa_rca',
	description:
		'QA Root Cause Analysis: dev/qa side, multiple variants. Sprint-scoped; when ' +
		'sprints[] is omitted, defaults to the 3 most recent meaningful sprints and ' +
		'surfaces the calendar window covered in `_windowCovered`. (See instructions.ts.)',
	inputSchema: RcaInput,
	handler: async (args, ctx) => {
		// Same auto-fill as qa_metric — RCA endpoints silent-empty without scope.
		const noSprints = !args.sprints || args.sprints.length === 0;
		const noVersions = !args.versions || args.versions.length === 0;
		const autoSprintInfos =
			noSprints && noVersions
				? await recentSprintInfos(ctx.api, args.projectId, 3)
				: undefined;
		const autoSprints = autoSprintInfos?.map((s) => s.id);
		const res = (await ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/qa/rca/${args.side}-${args.variant}`,
			query: {
				sprints: autoSprints ?? args.sprints,
				versions: args.versions,
				type: args.type,
			},
		})) as RcaRes;
		const normalised = normaliseRcaNames(res);
		const windowCovered = windowCoveredFrom(autoSprintInfos);
		return {
			...(normalised as Record<string, unknown>),
			...(autoSprints ? { _autoFilledSprints: autoSprints } : {}),
			...(windowCovered ? { _windowCovered: windowCovered } : {}),
		};
	},
};
