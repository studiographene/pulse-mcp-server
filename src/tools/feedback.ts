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

export const getFeedbackTool: ToolDefinition<typeof GetFeedbackInput> = {
	name: 'pulse_get_feedback',
	description: 'Single feedback item by id. (See instructions.ts.)',
	inputSchema: GetFeedbackInput,
	handler: async (args, ctx) =>
		ctx.api.request({ method: 'GET', path: `/feedback/${args.feedbackId}` }),
};
