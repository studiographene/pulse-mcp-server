import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * Project-level read tools. Wrap:
 *   GET  /projects                  — dashboard list
 *   GET  /projects/{projectId}      — full detail
 */

const ListProjectsInput = z.object({
	companyId: z
		.string()
		.uuid()
		.optional()
		.describe('Optional company UUID filter. Omit to list all projects the user can see.'),
});

export const listProjectsTool: ToolDefinition<typeof ListProjectsInput> = {
	name: 'pulse_list_projects',
	description:
		'List all Pulse projects the current user has access to. Returns project summaries ' +
		'including id, name, start/end dates, description, member count, and tool linking status. ' +
		'Use this when the user asks "what projects do I have" or before calling any project-specific tool.',
	inputSchema: ListProjectsInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: '/projects',
			query: { companyId: args.companyId },
		}),
};

const GetProjectInput = z.object({
	projectId: z.string().uuid().describe('Pulse project UUID. Get from pulse_list_projects.'),
});

export const getProjectTool: ToolDefinition<typeof GetProjectInput> = {
	name: 'pulse_get_project',
	description:
		'Fetch full details for a single Pulse project — name, description, dates, linked ' +
		'repos/boards, current team members, and tool integrations. Use this to answer questions ' +
		'about a specific project or before member updates.',
	inputSchema: GetProjectInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}`,
		}),
};

const ListProjectMembersInput = z.object({
	projectId: z.string().uuid().describe('Pulse project UUID.'),
});

export const listProjectMembersTool: ToolDefinition<typeof ListProjectMembersInput> = {
	name: 'pulse_list_project_members',
	description:
		'List the team members currently assigned to a Pulse project. Returns user id, name, ' +
		'email, and role for each. Call this before proposing any member additions or removals.',
	inputSchema: ListProjectMembersInput,
	handler: async (args, ctx) => {
		const project = (await ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}`,
		})) as { data?: { members?: unknown[] }; members?: unknown[] };
		// Response is wrapped — handle both shapes defensively.
		return { members: project?.data?.members ?? project?.members ?? [] };
	},
};
