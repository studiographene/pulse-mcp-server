import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * User-directory tools. Wrap:
 *   GET /users/me              — current authenticated user
 *   GET /users                 — all users the current user can see
 *   GET /users/user-by-company — users scoped to a company
 */

const WhoAmIInput = z.object({});

export const whoamiTool: ToolDefinition<typeof WhoAmIInput> = {
	name: 'pulse_whoami',
	description:
		'Return the current Pulse user (the account whose access token is configured). ' +
		'Useful for sanity-checking the MCP is authenticated correctly and for identifying ' +
		'the caller before self-referential queries like "what projects am I on".',
	inputSchema: WhoAmIInput,
	handler: async (_args, ctx) => ctx.api.request({ method: 'GET', path: '/users/me' }),
};

const ListUsersInput = z.object({
	companyId: z
		.string()
		.uuid()
		.optional()
		.describe('Optional company UUID to scope results. Omit for all visible users.'),
});

export const listUsersTool: ToolDefinition<typeof ListUsersInput> = {
	name: 'pulse_list_users',
	description:
		'List Pulse users the current user has access to. Returns id, name, email, role, ' +
		'and jobTitle for each. Use this to resolve names or emails to user UUIDs before ' +
		'any member update operation.',
	inputSchema: ListUsersInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: '/users',
			query: { companyId: args.companyId },
		}),
};

const FindUserInput = z.object({
	query: z
		.string()
		.min(1)
		.describe('Name or email (substring match, case-insensitive) to search for.'),
	companyId: z.string().uuid().optional(),
});

export const findUserTool: ToolDefinition<typeof FindUserInput> = {
	name: 'pulse_find_user',
	description:
		'Find Pulse users by name or email fragment. Returns matching users with their UUIDs. ' +
		'Prefer this over pulse_list_users when the caller already has a name/email in mind — ' +
		'e.g. "find user Mavia" → returns her UUID for downstream member updates.',
	inputSchema: FindUserInput,
	handler: async (args, ctx) => {
		const users = (await ctx.api.request({
			method: 'GET',
			path: '/users',
			query: { companyId: args.companyId },
		})) as { data?: unknown[] } | unknown[];
		const list = (Array.isArray(users) ? users : (users?.data ?? [])) as Array<{
			fullName?: string;
			email?: string;
		}>;
		const q = args.query.toLowerCase();
		return {
			matches: list.filter(
				(u) =>
					(u.fullName ?? '').toLowerCase().includes(q) ||
					(u.email ?? '').toLowerCase().includes(q)
			),
		};
	},
};
