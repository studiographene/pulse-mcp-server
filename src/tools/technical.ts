import { z } from 'zod';
import { ToolDefinition } from './types';
import { resolveRepoIds } from '../utils/project-context';

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
		return ctx.api.request({
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
		});
	},
};

const VersionUpgradesInput = TscBaseInput.extend({
	includeDetails: z.boolean().default(false),
	apiVersion: z.enum(['default', 'v1', 'v2']).default('v2'),
});

export const getVersionUpgradesTool: ToolDefinition<typeof VersionUpgradesInput> = {
	name: 'pulse_get_version_upgrades',
	description: 'Out-of-date dependencies (v2 recommended). (See instructions.ts.)',
	inputSchema: VersionUpgradesInput,
	handler: async (args, ctx) => {
		const prefixMap: Record<string, string> = { default: '', v1: '/v1', v2: '/v2' };
		const prefix = prefixMap[args.apiVersion];
		const repoIds = await resolveRepoIds(ctx.api, args.projectId, args.repoIds);
		return ctx.api.request({
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
	},
};

const UrlsListInput = z.object({ projectId: z.string().uuid() });

export const listProjectUrlsTool: ToolDefinition<typeof UrlsListInput> = {
	name: 'pulse_list_project_urls',
	description: 'List URLs registered for page-speed scanning. (See instructions.ts.)',
	inputSchema: UrlsListInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/tsc/urls`,
		}),
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
	description: 'Page-speed / Lighthouse results for one URL. (See instructions.ts.)',
	inputSchema: UrlDetailInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/tsc/url/${args.projectUrlId}${
				args.includeDetails ? '/details' : ''
			}`,
			query: args.includeDetails ? { range: args.range } : undefined,
		}),
};

// pulse_get_page_speed_scan was removed: it fetched a single historic scan by id, but
// to discover a scan id you had to call pulse_get_url_scan first — and that response
// already includes the latest scan's data (and with includeDetails, the full history).
// Leaving both tools registered tempted Claude into redundant chains.
