import { z } from 'zod';
import { ToolDefinition } from './types';

/**
 * Technical Success Criteria (TSC) metrics — product security, page-speed scans,
 * test coverage, URL analysis, version upgrades.
 */

const ProductSecurityInput = z.object({
	projectId: z.string().uuid(),
	range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
	includeDetails: z.boolean().default(false),
});

export const getProductSecurityTool: ToolDefinition<typeof ProductSecurityInput> = {
	name: 'pulse_get_product_security',
	description:
		'Fetch product-security scan results for a project (e.g. SAST/DAST findings, CVE ' +
		'counts, vulnerability severity breakdown). Include details for per-finding list.',
	inputSchema: ProductSecurityInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/tsc/product-security${
				args.includeDetails ? '/details' : ''
			}`,
			query: { range: args.range },
		}),
};

const TestCoverageInput = z.object({
	projectId: z.string().uuid(),
	branch: z.string().optional(),
	range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
	repoIds: z.array(z.string()).optional(),
	search: z.string().optional(),
	page: z.number().int().optional(),
	limit: z.number().int().optional(),
});

export const getTestCoverageTool: ToolDefinition<typeof TestCoverageInput> = {
	name: 'pulse_get_test_coverage',
	description:
		'Fetch test-case coverage metrics for a project — line / branch / function coverage ' +
		'per file or repo. Useful for "what is our test coverage on X repo".',
	inputSchema: TestCoverageInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/tsc/test-case-coverage`,
			query: {
				branch: args.branch,
				range: args.range,
				repoIds: args.repoIds,
				search: args.search,
				page: args.page,
				limit: args.limit,
			},
		}),
};

const VersionUpgradesInput = z.object({
	projectId: z.string().uuid(),
	branch: z.string().optional(),
	range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
	repoIds: z.array(z.string()).optional(),
	includeDetails: z.boolean().default(false),
	apiVersion: z.enum(['default', 'v1', 'v2']).default('v2'),
});

export const getVersionUpgradesTool: ToolDefinition<typeof VersionUpgradesInput> = {
	name: 'pulse_get_version_upgrades',
	description:
		'Fetch dependency / package version-upgrade status for a project: which packages are ' +
		'out of date, how far behind, severity. v2 is the newest response shape (recommended).',
	inputSchema: VersionUpgradesInput,
	handler: async (args, ctx) => {
		const prefixMap: Record<string, string> = { default: '', v1: '/v1', v2: '/v2' };
		const prefix = prefixMap[args.apiVersion];
		return ctx.api.request({
			method: 'GET',
			path: `${prefix}/projects/${args.projectId}/metrics/tsc/version-upgrades${
				args.includeDetails ? '/details' : ''
			}`,
			query: { branch: args.branch, range: args.range, repoIds: args.repoIds },
		});
	},
};

const UrlsListInput = z.object({ projectId: z.string().uuid() });

export const listProjectUrlsTool: ToolDefinition<typeof UrlsListInput> = {
	name: 'pulse_list_project_urls',
	description: 'List the URLs registered for page-speed / URL-level scanning on a project.',
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
});

export const getUrlScanTool: ToolDefinition<typeof UrlDetailInput> = {
	name: 'pulse_get_url_scan',
	description:
		'Fetch page-speed / Lighthouse-style scan results for a single registered URL. ' +
		'Include details for the full per-scan payload.',
	inputSchema: UrlDetailInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/tsc/url/${args.projectUrlId}${
				args.includeDetails ? '/details' : ''
			}`,
		}),
};

const PageSpeedScanInput = z.object({
	projectId: z.string().uuid(),
	pageSpeedInfoId: z
		.string()
		.optional()
		.describe('Specific scan id. Omit to list all scans on the project.'),
});

export const getPageSpeedScanTool: ToolDefinition<typeof PageSpeedScanInput> = {
	name: 'pulse_get_page_speed_scan',
	description:
		'Fetch page-speed scan results for a project. Omit pageSpeedInfoId to list all scans, ' +
		'or provide one to get a single scan in detail.',
	inputSchema: PageSpeedScanInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/projects/${args.projectId}/metrics/tsc/scan${
				args.pageSpeedInfoId ? `/${args.pageSpeedInfoId}` : ''
			}`,
		}),
};
