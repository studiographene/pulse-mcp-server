import { z } from 'zod';
import { ToolDefinition } from './types';
import { stripAvatarUrls } from './util/compact';

/**
 * User-directory tools. Wrap:
 *   GET /users/me              — current authenticated user
 *   GET /users                 — all users the current user can see
 *
 * GET /users returns users with separate firstName/lastName (not fullName).
 * find_user must concatenate when matching by query string.
 */

interface PulseUser {
	id?: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	[k: string]: unknown;
}

function fullName(user: PulseUser): string {
	return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
}

/** Unwrap the Pulse envelope { data: [...] } or return the raw array. */
function unwrapUsers(raw: unknown): PulseUser[] {
	if (Array.isArray(raw)) return raw as PulseUser[];
	const wrapped = raw as { data?: unknown };
	return Array.isArray(wrapped?.data) ? (wrapped.data as PulseUser[]) : [];
}

const WhoAmIInput = z.object({});

export const whoamiTool: ToolDefinition<typeof WhoAmIInput> = {
	name: 'pulse_whoami',
	description: 'Return the current Pulse user. (See instructions.ts.)',
	inputSchema: WhoAmIInput,
	handler: async (_args, ctx) =>
		stripAvatarUrls(await ctx.api.request({ method: 'GET', path: '/users/me' })),
};

const ListUsersInput = z.object({
	companyId: z.string().uuid().optional(),
	page: z
		.number()
		.int()
		.min(1)
		.default(1)
		.describe('Page number (default 1). Results are paginated client-side.'),
	limit: z
		.number()
		.int()
		.min(1)
		.max(200)
		.default(50)
		.describe(
			'Results per page (default 50, max 200). Pulse returns all users in one payload; ' +
				'we paginate client-side to keep tool responses within token limits.'
		),
});

export const listUsersTool: ToolDefinition<typeof ListUsersInput> = {
	name: 'pulse_list_users',
	description: 'List Pulse users (paginated). (See instructions.ts.)',
	inputSchema: ListUsersInput,
	handler: async (args, ctx) => {
		const raw = await ctx.api.request({
			method: 'GET',
			path: '/users',
			query: { companyId: args.companyId },
		});
		const all = unwrapUsers(raw);
		const start = (args.page - 1) * args.limit;
		const end = start + args.limit;
		return {
			page: args.page,
			limit: args.limit,
			total: all.length,
			totalPages: Math.max(1, Math.ceil(all.length / args.limit)),
			users: stripAvatarUrls(all.slice(start, end)),
		};
	},
};

const FindUserInput = z.object({
	query: z
		.string()
		.min(1)
		.describe(
			'Name substring (case-insensitive) to search for. Matches against ' +
				'firstName + lastName. Note: the Pulse /users endpoint does NOT return ' +
				'email addresses, so email substrings cannot be matched here — use the ' +
				'UUID directly if you have it.'
		),
	companyId: z.string().uuid().optional(),
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.default(20)
		.describe('Max matches to return (default 20).'),
});

export const findUserTool: ToolDefinition<typeof FindUserInput> = {
	name: 'pulse_find_user',
	description: 'Find Pulse users by name substring. (See instructions.ts.)',
	inputSchema: FindUserInput,
	handler: async (args, ctx) => {
		const raw = await ctx.api.request({
			method: 'GET',
			path: '/users',
			query: { companyId: args.companyId },
		});
		const all = unwrapUsers(raw);
		const q = args.query.toLowerCase();
		const matches = all
			.filter((u) => fullName(u).toLowerCase().includes(q))
			.slice(0, args.limit);
		return { query: args.query, matchCount: matches.length, matches: stripAvatarUrls(matches) };
	},
};
