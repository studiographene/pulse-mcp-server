import { z } from 'zod';
import { ToolDefinition } from './types';
import { PulseApiClient } from '../api/client';

/**
 * Cycle time — 3 variants across 3 endpoints with different param contracts:
 *   - overall: sprints[] or versions[] required. BE 400s if neither supplied.
 *   - summary: same as overall plus required `type` (graph|table).
 *   - details: SINGULAR `sprint` or `version` string required. BE rejects arrays.
 *
 * To keep the tool one-shot friendly, overall + summary auto-fetch the 3 most
 * recent sprint IDs when neither sprints[] nor versions[] is supplied. Details
 * auto-fetches the single most recent sprint when neither `sprint` nor `version`
 * is supplied. Callers who want a specific window can always override.
 */

const CycleTimeInput = z.object({
	projectId: z.string().uuid(),
	variant: z
		.enum(['overall', 'summary', 'details'])
		.describe(
			'overall = headline cycle time; summary = breakdown by phase (graph or table); ' +
				'details = per-ticket rows. All variants are sprint- or version-scoped; when ' +
				'neither is supplied the tool auto-fills the most recent sprint(s) from Jira.'
		),
	type: z
		.enum(['graph', 'table'])
		.optional()
		.describe('Required for variant=summary. Ignored elsewhere.'),
	sprints: z
		.array(z.string())
		.optional()
		.describe('Sprint IDs (array). Used by overall + summary.'),
	versions: z
		.array(z.string())
		.optional()
		.describe('Version IDs (array). Used by overall + summary.'),
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

interface RawBoardsResponse {
	data?: {
		boards: Array<{
			sprints: Array<{ id: string; startDate: string | null }>;
		}>;
	};
}

/**
 * Pulse returns cycle-time values in MILLISECONDS (confirmed from the Pulse FE,
 * which wraps these in `formatMillisecondsForCycleTime({ milliseconds })`). The
 * raw numbers are unlabelled, so we augment responses with explicit unit metadata
 * and a human-readable fallback.
 */
function formatMs(ms: number | null | undefined): string {
	if (ms == null || !Number.isFinite(ms)) return 'n/a';
	const totalMinutes = Math.round(ms / 60_000);
	if (totalMinutes < 60) return `${totalMinutes}m`;
	const hours = Math.floor(totalMinutes / 60);
	const mins = totalMinutes % 60;
	if (hours < 24) return `${hours}h ${mins}m`;
	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	return `${days}d ${remHours}h`;
}

async function recentSprintIds(
	api: PulseApiClient,
	projectId: string,
	n: number
): Promise<string[]> {
	const raw = (await api.request({
		method: 'GET',
		path: `/projects/${projectId}/jira/boards`,
	})) as RawBoardsResponse;
	const sprints = (raw?.data?.boards ?? []).flatMap((b) => b.sprints ?? []);
	sprints.sort((a, b) => {
		const ad = a.startDate ? Date.parse(a.startDate) : 0;
		const bd = b.startDate ? Date.parse(b.startDate) : 0;
		return bd - ad;
	});
	return sprints.slice(0, n).map((s) => s.id);
}

export const getCycleTimeTool: ToolDefinition<typeof CycleTimeInput> = {
	name: 'pulse_get_cycle_time',
	description: 'Cycle time: overall / summary / details variants. (See instructions.ts.)',
	inputSchema: CycleTimeInput,
	handler: async (args, ctx) => {
		const isDetails = args.variant === 'details';

		if (isDetails) {
			// details needs singular sprint/version; auto-fill if omitted
			const needsAutoSprint = !args.sprint && !args.version;
			const sprint = needsAutoSprint
				? (await recentSprintIds(ctx.api, args.projectId, 1))[0]
				: args.sprint;
			return ctx.api.request({
				method: 'GET',
				path: `/projects/${args.projectId}/cycle-time/details`,
				query: {
					sprint,
					version: args.version,
					sortKey: args.sortKey,
					sortOrder: args.sortOrder,
				},
			});
		}

		// overall / summary need sprints[] or versions[]; auto-fill if both missing
		const noSprints = !args.sprints || args.sprints.length === 0;
		const noVersions = !args.versions || args.versions.length === 0;
		const sprints =
			noSprints && noVersions
				? await recentSprintIds(ctx.api, args.projectId, 3)
				: args.sprints;
		const res = (await ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/cycle-time/${args.variant}`,
			query: {
				type: args.type,
				sprints,
				versions: args.versions,
			},
		})) as { data?: { overall?: number } & Record<string, unknown> } & Record<string, unknown>;

		// Augment the overall variant with unit + human-readable form.
		// The raw number from the BE is milliseconds (confirmed from the Pulse FE).
		if (args.variant === 'overall' && typeof res?.data?.overall === 'number') {
			return {
				...res,
				data: {
					...res.data,
					unit: 'milliseconds',
					overallFormatted: formatMs(res.data.overall),
					overallHours:
						Math.round((res.data.overall / 3_600_000) * 100) / 100,
				},
			};
		}
		return res;
	},
};
