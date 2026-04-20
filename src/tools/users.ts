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
	description: 'Return the current Pulse user. (See instructions.ts.)',
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
	description: 'List Pulse users visible to the caller. (See instructions.ts.)',
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
	description: 'Find Pulse users by name/email substring. (See instructions.ts.)',
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
