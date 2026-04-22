import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * Tech audit endpoint.
 *
 * The BE 500s when `ref` is not supplied. It also 500s if `ref` doesn't exist on the
 * target repo (e.g. `ref=master` when the repo uses `main`). We default to `main` and
 * surface the limitation in the description — callers who hit a 500 should try `master`
 * or the repo's actual default branch explicitly.
 */

const TechAuditInput = z.object({
	projectId: z.string().uuid(),
	ref: z
		.string()
		.default('main')
		.describe(
			'Git ref (branch/tag/sha) to audit. Default "main"; BE 500s if ref missing or not ' +
				'found. Override to the repo\'s actual default branch if needed.'
		),
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
