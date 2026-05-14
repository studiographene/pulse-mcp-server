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

/** True when a value is a non-array empty `{}` object. */
function isEmptyObject(v: unknown): boolean {
	return (
		!!v &&
		typeof v === 'object' &&
		!Array.isArray(v) &&
		Object.keys(v as Record<string, unknown>).length === 0
	);
}

/**
 * Walks the tech-audit response and removes any `tools` field whose value is
 * an empty object. Surgical (doesn't touch `tools` arrays, or `tools` objects
 * that actually carry data — once the BE starts populating them they will
 * pass through unchanged). See Cowork feedback 2026-05-14, issue #19.
 */
function dropEmptyToolsField<T>(value: T): T {
	if (Array.isArray(value)) return value.map(dropEmptyToolsField) as unknown as T;
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const skip = k === 'tools' && isEmptyObject(v);
			if (!skip) {
				out[k] = dropEmptyToolsField(v);
			}
		}
		return out as unknown as T;
	}
	return value;
}

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
		// Drop the empty `tools` field — the BE returns `tools: {}` for every
		// repo currently (feature not implemented), so it adds noise without
		// any signal. Will reappear automatically once the BE starts populating
		// it. See Cowork feedback 2026-05-14, issue #19.
		const cleaned = dropEmptyToolsField(raw);
		return args.responseFormat === 'full' ? cleaned : summariseLongArrays(cleaned);
	},
};

