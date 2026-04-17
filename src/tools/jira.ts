import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * Jira integration tools — expose sprints + releases so Claude can resolve
 * them before calling QA / PM metrics that need sprint or version filters.
 *
 * Wraps:
 *   GET /projects/{projectId}/jira/boards   — boards + nested sprints
 *   GET /projects/{projectId}/jira/releases — flat releases/versions list
 */

interface RawBoardsResponse {
	data?: {
		organizationId: string;
		projectId: string;
		boards: Array<{
			id: string;
			jiraId: string;
			name: string;
			sprints: Array<{
				id: string;
				sprintName: string;
				startDate: string | null;
				endDate: string | null;
				boardName: string;
			}>;
		}>;
	};
}

const ListSprintsInput = z.object({
	projectId: z.string().uuid(),
	includeBoards: z
		.boolean()
		.default(false)
		.describe('If true, return the board structure with nested sprints. Default: flat list.'),
});

export const listProjectSprintsTool: ToolDefinition<typeof ListSprintsInput> = {
	name: 'pulse_list_project_sprints',
	description:
		"List the Jira sprints for a Pulse project. Sprints are ordered newest-first. " +
		"Call this BEFORE pulse_get_qa_metric, pulse_get_qa_rca, or pulse_get_estimates_vs_actuals " +
		'if the user asks about a specific sprint, or if no sprint filter is given — several QA ' +
		'metrics (FTP, reopen rate, defect resolution) return empty without a sprint filter. ' +
		'Default behaviour: grab the last 1–3 recent sprints and pass their ids to the metric tool.',
	inputSchema: ListSprintsInput,
	handler: async (args, ctx) => {
		const raw = (await ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/jira/boards`,
		})) as RawBoardsResponse;
		const boards = raw?.data?.boards ?? [];
		if (args.includeBoards) {
			return { boards };
		}
		// Flatten into a single sprint list, newest-first by startDate.
		const sprints = boards.flatMap((b) =>
			(b.sprints ?? []).map((s) => ({
				id: s.id,
				name: s.sprintName,
				boardName: b.name,
				startDate: s.startDate,
				endDate: s.endDate,
			}))
		);
		sprints.sort((a, b) => {
			const ad = a.startDate ? Date.parse(a.startDate) : 0;
			const bd = b.startDate ? Date.parse(b.startDate) : 0;
			return bd - ad;
		});
		return { sprints };
	},
};

interface RawReleasesResponse {
	data?: Array<{
		id: string;
		projectId: string;
		name: string;
		description: string;
		startDate: string | null;
		releaseDate: string | null;
		status: 'released' | 'unreleased' | string;
		projectKey: string;
	}>;
}

const ListReleasesInput = z.object({
	projectId: z.string().uuid(),
	status: z
		.enum(['released', 'unreleased', 'all'])
		.default('all')
		.describe('Filter by release status. Default: all.'),
});

export const listProjectReleasesTool: ToolDefinition<typeof ListReleasesInput> = {
	name: 'pulse_list_project_releases',
	description:
		'List Jira releases (a.k.a. versions) for a Pulse project. Use BEFORE QA / PM metric ' +
		'calls that accept a "versions" filter — pass the release ids to scope results. Default ' +
		'returns all; filter by status="released" for shipped versions or "unreleased" for planned.',
	inputSchema: ListReleasesInput,
	handler: async (args, ctx) => {
		const raw = (await ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/jira/releases`,
		})) as RawReleasesResponse;
		const releases = raw?.data ?? [];
		const filtered =
			args.status === 'all' ? releases : releases.filter((r) => r.status === args.status);
		return { releases: filtered };
	},
};
