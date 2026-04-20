import { z } from 'zod';
import { ToolDefinition } from './types';

const TechAuditInput = z.object({
	projectId: z.string().uuid(),
	ref: z
		.string()
		.optional()
		.describe('Optional git ref (branch / tag / sha) to audit. Defaults to default branch.'),
	workflowFilename: z
		.string()
		.optional()
		.describe('Optional GitHub Actions workflow filename to filter audit scope.'),
});

export const getTechAuditTool: ToolDefinition<typeof TechAuditInput> = {
	name: 'pulse_get_tech_audit',
	description: 'Tech audit: project compliance vs SG standards. (See instructions.ts.)',
	inputSchema: TechAuditInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: '/tech/audit',
			query: {
				projectId: args.projectId,
				ref: args.ref,
				workflowFilename: args.workflowFilename,
			},
		}),
};
