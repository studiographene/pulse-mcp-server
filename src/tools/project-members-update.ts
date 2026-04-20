import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * The only write tool in v1: update project team members.
 *
 * Safety pattern — "propose/apply":
 *   1. `pulse_propose_project_member_changes` returns a DIFF (users to add/remove,
 *      resulting team). No state change.
 *   2. The caller (or the user) reviews it, then calls `pulse_apply_project_member_changes`
 *      with the same inputs to actually perform the PUT.
 *
 * The apply tool performs READ-MODIFY-WRITE:
 *   - GETs the project
 *   - Mutates only the `members` array
 *   - PUTs the full project payload back (the BE's CreateProjectDto requires all fields)
 *
 * This avoids two failure modes:
 *   - Partial PUT rejections if the BE strictly validates the DTO
 *   - Accidental wipes if the caller passes an incomplete body
 */

const MemberChangeInput = z.object({
	projectId: z.string().uuid(),
	addUserIds: z
		.array(z.string().uuid())
		.default([])
		.describe('User UUIDs to add to the project team.'),
	removeUserIds: z
		.array(z.string().uuid())
		.default([])
		.describe('User UUIDs to remove from the project team.'),
});

interface ProjectWithMembers {
	id: string;
	name: string;
	members: Array<{ id: string; fullName?: string; email?: string } | string>;
	[k: string]: unknown;
}

function extractMembers(project: unknown): ProjectWithMembers {
	// Pulse wraps responses in { data: ... } sometimes and returns raw other times.
	const unwrapped = (project as { data?: ProjectWithMembers })?.data ?? project;
	return unwrapped as ProjectWithMembers;
}

function memberIds(
	members: ProjectWithMembers['members']
): { ids: string[]; byId: Record<string, unknown> } {
	const byId: Record<string, unknown> = {};
	const ids = members.map((m) => {
		if (typeof m === 'string') {
			byId[m] = { id: m };
			return m;
		}
		byId[m.id] = m;
		return m.id;
	});
	return { ids, byId };
}

function computeDiff(
	currentIds: string[],
	add: string[],
	remove: string[]
): { before: string[]; after: string[]; adding: string[]; removing: string[]; unchanged: boolean } {
	const currentSet = new Set(currentIds);
	const adding = add.filter((id) => !currentSet.has(id));
	const removing = remove.filter((id) => currentSet.has(id));
	const afterSet = new Set(currentIds);
	for (const id of adding) afterSet.add(id);
	for (const id of removing) afterSet.delete(id);
	return {
		before: currentIds,
		after: Array.from(afterSet),
		adding,
		removing,
		unchanged: adding.length === 0 && removing.length === 0,
	};
}

export const proposeMemberChangesTool: ToolDefinition<typeof MemberChangeInput> = {
	name: 'pulse_propose_project_member_changes',
	description: 'DRY RUN for project member edits — diff only. (See instructions.ts.)',
	inputSchema: MemberChangeInput,
	handler: async (args, ctx) => {
		const project = extractMembers(
			await ctx.api.request({ method: 'GET', path: `/projects/${args.projectId}` })
		);
		const { ids, byId } = memberIds(project.members ?? []);
		const diff = computeDiff(ids, args.addUserIds, args.removeUserIds);
		return {
			project: { id: project.id, name: project.name },
			currentMembers: ids.map((id) => byId[id]),
			diff,
			note: diff.unchanged
				? 'No changes — the proposed add/remove set is already reflected in the current team.'
				: 'Review the diff and call pulse_apply_project_member_changes with the same arguments to apply.',
		};
	},
};

export const applyMemberChangesTool: ToolDefinition<typeof MemberChangeInput> = {
	name: 'pulse_apply_project_member_changes',
	description: 'APPLY project member changes after user confirms diff. (See instructions.ts.)',
	inputSchema: MemberChangeInput,
	handler: async (args, ctx) => {
		const project = extractMembers(
			await ctx.api.request({ method: 'GET', path: `/projects/${args.projectId}` })
		);
		const { ids } = memberIds(project.members ?? []);
		const diff = computeDiff(ids, args.addUserIds, args.removeUserIds);
		if (diff.unchanged) {
			return { applied: false, reason: 'No-op: current team already matches.', diff };
		}
		// Build PUT body: start from the existing project, replace members with the new UUID list.
		const body = { ...project, members: diff.after };
		await ctx.api.request({
			method: 'PUT',
			path: `/projects/${args.projectId}`,
			body,
		});
		return { applied: true, diff };
	},
};
