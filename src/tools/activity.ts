import { z } from 'zod';
import { ToolDefinition } from './types';
import { stripAvatarUrls } from './util/compact';

/**
 * Activity endpoints — cross-project / organisation-level views, aggregated per member.
 *
 * Note on list_org_members: the Pulse BE returns 500 without page + limit despite the
 * OpenAPI spec marking them optional. We enforce defaults here so the tool always works.
 *
 * Note on get_activity_overview: the BE intentionally returns `projects: []` for
 * non-Engineering users. The `projects` rollup is gated to departments in
 * {engineering-department list}. The
 * `organisationMembers` block is returned for everyone. This is by design — a
 * Product Manager calling the tool will see members but not the project rollup.
 */

const ActivityOverviewInput = z.object({});

export const getActivityOverviewTool: ToolDefinition<typeof ActivityOverviewInput> = {
	name: 'pulse_get_activity_overview',
	description:
		'Org-level activity dashboard (organisationMembers + projects rollup). NOTE: the ' +
		'`projects` array is gated to Engineering-department users on the BE; non-Engineering ' +
		'callers get `projects: []` by design. `organisationMembers` is always populated. ' +
		'(See instructions.ts.)',
	inputSchema: ActivityOverviewInput,
	handler: async (_args, ctx) => {
		const res = (await ctx.api.request({ method: 'GET', path: '/activity' })) as {
			data?: { projects?: unknown[] };
		} & Record<string, unknown>;
		// Attach an explicit note when the projects rollup is empty so callers
		// don't mistake "intentionally gated to Engineering" for "tool is broken".
		const projects = res?.data?.projects;
		if (Array.isArray(projects) && projects.length === 0) {
			return stripAvatarUrls({
				...res,
				note:
					'`projects` is empty. The BE gates this field to Engineering-department ' +
					'users only (engineering-department list). ' +
					"If you're in Product Management or another non-engineering department, " +
					"this is by design — `organisationMembers` still reflects the whole org. " +
					"For a specific project's data use pulse_list_projects + pulse_get_project.",
			});
		}
		return stripAvatarUrls(res);
	},
};

const OrgMembersInput = z.object({
	reportsTo: z.string().optional().describe('Filter to members reporting to this userId.'),
	page: z.number().int().min(1).default(1),
	// The BE rejects limit < 10 despite the OpenAPI spec saying otherwise
	// (observed during Cowork v1.3 smoke test, Apr 2026). Enforcing the real
	// minimum here so the first call never 400s.
	limit: z.number().int().min(10).max(100).default(20),
});

export const listOrgMembersTool: ToolDefinition<typeof OrgMembersInput> = {
	name: 'pulse_list_org_members',
	description: 'Org members with rolled-up activity (paginated). (See instructions.ts.)',
	inputSchema: OrgMembersInput,
	handler: async (args, ctx) =>
		stripAvatarUrls(
			await ctx.api.request({
				method: 'GET',
				path: '/activity/members',
				query: { reportsTo: args.reportsTo, page: args.page, limit: args.limit },
			})
		),
};

const MemberProfileInput = z.object({
	userId: z.string().uuid().describe('Pulse user UUID.'),
});

/** Rewrite DD-MM-YYYY strings to ISO YYYY-MM-DD; pass everything else through. */
function dmyToIso(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	const m = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
	return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
}

/** Deep-walk an object/array and convert DD-MM-YYYY date fields to ISO. */
function normaliseDates(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normaliseDates);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = /date|Date$/i.test(k) ? dmyToIso(v) : normaliseDates(v);
		}
		return out;
	}
	return value;
}

export const getMemberProfileTool: ToolDefinition<typeof MemberProfileInput> = {
	name: 'pulse_get_member_profile',
	description: "One member's cross-project metrics. (See instructions.ts.)",
	inputSchema: MemberProfileInput,
	handler: async (args, ctx) => {
		const res = await ctx.api.request({
			method: 'GET',
			path: `/activity/profile/${args.userId}`,
		});
		// BE returns date fields in DD-MM-YYYY for this endpoint while every other
		// tool returns ISO. Normalise at the edge so callers see one shape. Also
		// strip avatar URLs (this response embeds the user object and every
		// reportee).
		return stripAvatarUrls(normaliseDates(res));
	},
};
