import { z } from 'zod';
import { ToolDefinition } from './types';
import { resolveRepoIds } from '../utils/project-context';
import { summariseLongArrays } from './util/compact';

/**
 * Technical Success Criteria (TSC) metrics — product security, page-speed scans,
 * test coverage, URL analysis, version upgrades.
 *
 * All three of product-security / test-case-coverage / version-upgrades are siblings
 * on the BE: they share the same query shape and require:
 *   metric=TECHNICAL_SUCCESS_CRITERIA
 *   category=PRODUCT_SECURITY | TEST_CASE_COVERAGE | VERSION_UPGRADES
 * That's why we share a base input schema for them.
 */

const TSC_METRIC = 'TECHNICAL_SUCCESS_CRITERIA';

const TscBaseInput = z.object({
	projectId: z.string().uuid(),
	branch: z.string().optional(),
	range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
	repoIds: z.array(z.string()).optional(),
	search: z.string().optional(),
	page: z.number().int().min(1).optional(),
	limit: z.number().int().min(1).optional(),
	type: z.enum(['table', 'graph']).optional(),
	sortKey: z.enum(['repoName', 'libName']).optional(),
	sortOrder: z.enum(['asc', 'desc']).optional(),
	rag: z.enum(['major', 'minor', 'patch', 'deprecated']).optional(),
});

const ProductSecurityInput = TscBaseInput.extend({
	includeDetails: z.boolean().default(false),
});

export const getProductSecurityTool: ToolDefinition<typeof ProductSecurityInput> = {
	name: 'pulse_get_product_security',
	description: 'Product security scan results (SAST/DAST). (See instructions.ts.)',
	inputSchema: ProductSecurityInput,
	handler: async (args, ctx) => {
		const repoIds = await resolveRepoIds(ctx.api, args.projectId, args.repoIds);
		return ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/tsc/product-security${
				args.includeDetails ? '/details' : ''
			}`,
			query: {
				metric: TSC_METRIC,
				category: 'PRODUCT_SECURITY',
				branch: args.branch,
				range: args.range,
				repoIds,
				search: args.search,
				page: args.page,
				limit: args.limit,
				type: args.type,
				sortKey: args.sortKey,
				sortOrder: args.sortOrder,
				rag: args.rag,
			},
		});
	},
};

const TestCoverageInput = TscBaseInput;

export const getTestCoverageTool: ToolDefinition<typeof TestCoverageInput> = {
	name: 'pulse_get_test_coverage',
	description: 'Test coverage per file/repo. (See instructions.ts.)',
	inputSchema: TestCoverageInput,
	handler: async (args, ctx) => {
		const repoIds = await resolveRepoIds(ctx.api, args.projectId, args.repoIds);
		const notConfiguredNote =
			'No test-coverage data for this project. Most likely the repos have no ' +
			'coverage reports configured. Check the project settings on Pulse.';
		let res: { statusCode?: number; message?: string; data?: unknown };
		try {
			res = (await ctx.api.request({
				method: 'GET',
				path: `/projects/${args.projectId}/metrics/tsc/test-case-coverage`,
				query: {
					metric: TSC_METRIC,
					category: 'TEST_CASE_COVERAGE',
					branch: args.branch,
					range: args.range,
					repoIds,
					search: args.search,
					page: args.page,
					limit: args.limit,
					type: args.type,
					sortKey: args.sortKey,
					sortOrder: args.sortOrder,
					rag: args.rag,
				},
			})) as { statusCode?: number; message?: string; data?: unknown };
		} catch (err) {
			// The BE returns 404 "Table data not found" when a project has no
			// coverage reports ingested for the selected variant (e.g. table view
			// on a project that only has graph data, or no coverage at all).
			// Surface that as a graceful empty rather than an error so callers
			// can distinguish "not configured" from "real failure".
			const msg = (err as Error)?.message ?? '';
			if (/404/.test(msg) && /Table data not found/i.test(msg)) {
				return { statusCode: 200, data: null, note: notConfiguredNote };
			}
			throw err;
		}
		// When no coverage has been configured for the project, the BE returns a
		// success envelope with no `data` field. Normalise so callers always see
		// a `data` key and understand the empty state.
		if (res && typeof res === 'object' && !('data' in res)) {
			return { ...res, data: null, note: notConfiguredNote };
		}
		return res;
	},
};

const VersionUpgradesInput = TscBaseInput.extend({
	includeDetails: z.boolean().default(false),
	apiVersion: z.enum(['default', 'v1', 'v2']).default('v2'),
	responseFormat: z
		.enum(['summary', 'full'])
		.default('summary')
		.describe(
			'Details variant only. Default "summary" collapses long dependency lists into ' +
				'{ count, sample, truncated } — version_upgrades/details easily exceeds LLM ' +
				'token budgets even with small `limit`. Use "full" when you explicitly need ' +
				'every dependency enumerated.'
		),
});

export const getVersionUpgradesTool: ToolDefinition<typeof VersionUpgradesInput> = {
	name: 'pulse_get_version_upgrades',
	description: 'Out-of-date dependencies (v2 recommended). (See instructions.ts.)',
	inputSchema: VersionUpgradesInput,
	handler: async (args, ctx) => {
		const prefixMap: Record<string, string> = { default: '', v1: '/v1', v2: '/v2' };
		const prefix = prefixMap[args.apiVersion];
		const repoIds = await resolveRepoIds(ctx.api, args.projectId, args.repoIds);
		const raw = await ctx.api.request({
			method: 'GET',
			path: `${prefix}/projects/${args.projectId}/metrics/tsc/version-upgrades${
				args.includeDetails ? '/details' : ''
			}`,
			query: {
				metric: TSC_METRIC,
				category: 'VERSION_UPGRADES',
				branch: args.branch,
				range: args.range,
				repoIds,
				search: args.search,
				page: args.page,
				limit: args.limit,
				type: args.type,
				sortKey: args.sortKey,
				sortOrder: args.sortOrder,
				rag: args.rag,
			},
		});
		// Only summarise the /details shape; the summary shape is already dense.
		return args.includeDetails && args.responseFormat !== 'full'
			? summariseLongArrays(raw)
			: raw;
	},
};

const UrlsListInput = z.object({ projectId: z.string().uuid() });

/**
 * Pulse's BE returns Lighthouse scores in two different shapes for the SAME
 * data. The list / latest-scan endpoints return arrays of `{category, value,
 * status}` with display-cased category names ("SEO", "Performance",
 * "Accessibility", "Best Practices"). The `/details` (history) endpoint
 * returns objects keyed by camelCase category name (`seo`, `performance`,
 * `accessibility`, `bestPractices`).
 *
 * We normalise everything to the object-keyed form on the way out so
 * consumers don't need two parsers (Cowork feedback 2026-05-14, issue #7).
 *
 * Object-keyed wins because:
 *   - O(1) access by category — `scan.mobile.performance.value`
 *   - No reliance on display strings that might drift with the FE
 *   - Matches the `/details` shape, which is the newer convention
 */
const LIGHTHOUSE_CATEGORY_KEYS: Record<string, string> = {
	SEO: 'seo',
	Performance: 'performance',
	Accessibility: 'accessibility',
	'Best Practices': 'bestPractices',
};

function lighthouseCategoryToKey(display: string): string {
	return (
		LIGHTHOUSE_CATEGORY_KEYS[display] ??
		display.toLowerCase().replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
	);
}

/** Converts the array form to the canonical object-keyed form. */
function collectLighthouseArray(
	rows: unknown[]
): Record<string, { value: number; status: string }> {
	const collected: Record<string, { value: number; status: string }> = {};
	for (const entry of rows) {
		const e = entry as
			| { category?: unknown; value?: unknown; status?: unknown }
			| undefined;
		if (e && typeof e.category === 'string') {
			collected[lighthouseCategoryToKey(e.category)] = {
				value: typeof e.value === 'number' ? e.value : 0,
				status: typeof e.status === 'string' ? e.status : '',
			};
		}
	}
	return collected;
}

function normaliseLighthouseShape<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(normaliseLighthouseShape) as unknown as T;
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const isPlatformArray = (k === 'mobile' || k === 'desktop') && Array.isArray(v);
			out[k] = isPlatformArray
				? collectLighthouseArray(v as unknown[])
				: normaliseLighthouseShape(v);
		}
		return out as unknown as T;
	}
	return value;
}

export const listProjectUrlsTool: ToolDefinition<typeof UrlsListInput> = {
	name: 'pulse_list_project_urls',
	description: 'List URLs registered for page-speed scanning. (See instructions.ts.)',
	inputSchema: UrlsListInput,
	handler: async (args, ctx) => {
		const raw = await ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/tsc/urls`,
		});
		return normaliseLighthouseShape(raw);
	},
};

const UrlDetailInput = z.object({
	projectId: z.string().uuid(),
	projectUrlId: z.string().describe('URL id from pulse_list_project_urls.'),
	includeDetails: z.boolean().default(false),
	range: z
		.enum(['7 days', '30 days', '1 year'])
		.default('30 days')
		.describe('Required when includeDetails=true, ignored otherwise.'),
});

export const getUrlScanTool: ToolDefinition<typeof UrlDetailInput> = {
	name: 'pulse_get_url_scan',
	description:
		'Page-speed / Lighthouse results for one URL. mobile/desktop are always ' +
		'returned as objects keyed by category (seo, performance, accessibility, ' +
		'bestPractices) regardless of includeDetails. (See instructions.ts.)',
	inputSchema: UrlDetailInput,
	handler: async (args, ctx) => {
		const raw = await ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/tsc/url/${args.projectUrlId}${
				args.includeDetails ? '/details' : ''
			}`,
			query: args.includeDetails ? { range: args.range } : undefined,
		});
		return normaliseLighthouseShape(raw);
	},
};

// pulse_get_page_speed_scan was removed: it fetched a single historic scan by id, but
// to discover a scan id you had to call pulse_get_url_scan first — and that response
// already includes the latest scan's data (and with includeDetails, the full history).
// Leaving both tools registered tempted Claude into redundant chains.
