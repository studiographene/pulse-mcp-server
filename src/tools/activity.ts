import { z } from 'zod';
import { ToolDefinition } from './types';

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
			return {
				...res,
				note:
					'`projects` is empty. The BE gates this field to Engineering-department ' +
					'users only (engineering-department list). ' +
					"If you're in Product Management or another non-engineering department, " +
					"this is by design — `organisationMembers` still reflects the whole org. " +
					"For a specific project's data use pulse_list_projects + pulse_get_project.",
			};
		}
		return res;
	},
};

const OrgMembersInput = z.object({
	reportsTo: z.string().optional().describe('Filter to members reporting to this userId.'),
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(100).default(20),
});

export const listOrgMembersTool: ToolDefinition<typeof OrgMembersInput> = {
	name: 'pulse_list_org_members',
	description: 'Org members with rolled-up activity (paginated). (See instructions.ts.)',
	inputSchema: OrgMembersInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: '/activity/members',
			query: { reportsTo: args.reportsTo, page: args.page, limit: args.limit },
		}),
};

const MemberProfileInput = z.object({
	userId: z.string().uuid().describe('Pulse user UUID.'),
});

export const getMemberProfileTool: ToolDefinition<typeof MemberProfileInput> = {
	name: 'pulse_get_member_profile',
	description: "One member's cross-project metrics. (See instructions.ts.)",
	inputSchema: MemberProfileInput,
	handler: async (args, ctx) =>
		ctx.api.request({ method: 'GET', path: `/activity/profile/${args.userId}` }),
};
