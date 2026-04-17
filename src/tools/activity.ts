import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * Activity endpoints — cross-project / organisation-level views, aggregated per member.
 */

const ActivityOverviewInput = z.object({});

export const getActivityOverviewTool: ToolDefinition<typeof ActivityOverviewInput> = {
	name: 'pulse_get_activity_overview',
	description:
		'Fetch the organisation-level activity page data — cross-project rollups visible on ' +
		"the Pulse Activity tab. Good for questions like 'how is the org doing overall this week'.",
	inputSchema: ActivityOverviewInput,
	handler: async (_args, ctx) => ctx.api.request({ method: 'GET', path: '/activity' }),
};

const OrgMembersInput = z.object({
	reportsTo: z.string().optional().describe('Filter to members reporting to this userId.'),
	page: z.number().int().optional(),
	limit: z.number().int().optional(),
});

export const listOrgMembersTool: ToolDefinition<typeof OrgMembersInput> = {
	name: 'pulse_list_org_members',
	description:
		'List members at organisation level with their rolled-up activity summary. Supports ' +
		'pagination and filter by manager ("reportsTo"). Useful for manager-view queries.',
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
	description:
		'Fetch an individual member activity profile — their cross-project metrics roll-up. ' +
		'Use for 1:1 prep or individual performance conversations.',
	inputSchema: MemberProfileInput,
	handler: async (args, ctx) =>
		ctx.api.request({ method: 'GET', path: `/activity/profile/${args.userId}` }),
};
