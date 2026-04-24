import { z } from 'zod';
import { ToolDefinition } from './types';
import { summariseLongArrays } from './util/compact';

/**
 * Tech audit endpoint.
 *
 * The BE 500s when `ref` is not supplied. It also 500s if `ref` doesn't exist on the
 * target repo (e.g. `ref=master` when the repo uses `main`). We default to `main` and
 * surface the limitation in the description — callers who hit a 500 should try `master`
 * or the repo's actual default branch explicitly.
 *
 * Payload: the BE returns a flat list of every incorrectly-named branch in the repo —
 * easily ~20–30k tokens on mid-sized monorepos. `responseFormat: 'summary'` collapses
 * arrays of >=20 items into `{ count, sample, truncated }`, keeping headline pass/fail
 * counts intact. Default is `summary` — switch to `full` only when you actually need
 * every branch enumerated.
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
	responseFormat: z
		.enum(['summary', 'full'])
		.default('summary')
		.describe(
			'Default "summary" collapses long arrays (e.g. incorrectly-named branches) ' +
				'into { count, sample, truncated } to stay within LLM token budgets. ' +
				'Use "full" only when you explicitly need every item.'
		),
});

export const getTechAuditTool: ToolDefinition<typeof TechAuditInput> = {
	name: 'pulse_get_tech_audit',
	description: 'Tech audit: project compliance vs SG standards. (See instructions.ts.)',
	inputSchema: TechAuditInput,
	handler: async (args, ctx) => {
		const raw = await ctx.api.request({
			method: 'GET',
			path: '/tech/audit',
			query: {
				projectId: args.projectId,
				ref: args.ref,
				workflowFilename: args.workflowFilename,
			},
		});
		return args.responseFormat === 'full' ? raw : summariseLongArrays(raw);
	},
};
