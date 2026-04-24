import { z } from 'zod';
import { ToolDefinition } from './types';

const ListFeedbackInput = z.object({
	page: z.number().int().default(1),
	limit: z.number().int().default(20),
});

export const listFeedbackTool: ToolDefinition<typeof ListFeedbackInput> = {
	name: 'pulse_list_feedback',
	description: 'Paginated list of Pulse feedback items. (See instructions.ts.)',
	inputSchema: ListFeedbackInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: '/feedback',
			query: { page: args.page, limit: args.limit },
		}),
};

const GetFeedbackInput = z.object({
	feedbackId: z.string().describe('Feedback id from pulse_list_feedback.'),
});

interface RawFeedback {
	body?: string;
	description?: string;
	[k: string]: unknown;
}

export const getFeedbackTool: ToolDefinition<typeof GetFeedbackInput> = {
	name: 'pulse_get_feedback',
	description: 'Single feedback item by id. (See instructions.ts.)',
	inputSchema: GetFeedbackInput,
	handler: async (args, ctx) => {
		const res = (await ctx.api.request({
			method: 'GET',
			path: `/feedback/${args.feedbackId}`,
		})) as { data?: RawFeedback } & Record<string, unknown>;
		// BE returns `body` and `description` with identical HTML content. Drop the
		// duplicate `description` field so callers don't think they're two things.
		if (res?.data && typeof res.data === 'object') {
			const inner = { ...res.data };
			if (inner.body && inner.description && inner.body === inner.description) {
				delete inner.description;
			}
			return { ...res, data: inner };
		}
		return res;
	},
};
