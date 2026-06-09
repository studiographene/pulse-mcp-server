import { z } from 'zod';
import { ToolContext, ToolDefinition } from './types';
import { stripAvatarUrls } from './util/compact';

/**
 * Activity endpoints — cross-project / organisation-level views, aggregated per member.
 *
 * Note on list_org_members: the Pulse BE returns 500 without page + limit despite the
 * OpenAPI spec marking them optional. We enforce defaults here so the tool always works.
 *
 * Note on get_activity_overview: the BE intentionally returns `projects: []` for
 * non-engineering users. The `projects` rollup is gated to engineering-department
 * users; the `organisationMembers` block is returned for everyone. This is by
 * design — a non-engineering caller will see members but not the project rollup.
 */

const ActivityOverviewInput = z.object({
	range: z
		.enum(['7 days', '30 days', '1 year'])
		.default('30 days')
		.describe(
			'Activity window. The `projects` rollup is computed from member activity ' +
				'within this window. Matches the Pulse FE Activity page date filter.'
		),
	customRange: z
		.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
		.length(2)
		.optional()
		.describe('Custom [startISO, endISO] window. Overrides range when set.'),
});

export const getActivityOverviewTool: ToolDefinition<typeof ActivityOverviewInput> = {
	name: 'pulse_get_activity_overview',
	description:
		'Org-level activity dashboard (organisationMembers + projects rollup). NOTE: the ' +
		'`projects` array is gated to Engineering-department users on the BE; non-Engineering ' +
		'callers get `projects: []` by design. `organisationMembers` is always populated. ' +
		'(See instructions.ts.)',
	inputSchema: ActivityOverviewInput,
	handler: async (args, ctx) => {
		const res = (await ctx.api.request({
			method: 'GET',
			path: '/activity',
			query: {
				range: args.customRange ? undefined : args.range,
				customRange: args.customRange,
			},
		})) as {
			data?: { projects?: unknown[] };
		} & Record<string, unknown>;
		// Attach an explicit note when the projects rollup is empty so callers
		// don't mistake "intentionally gated to Engineering" for "tool is broken".
		const projects = res?.data?.projects;
		if (Array.isArray(projects) && projects.length === 0) {
			return stripAvatarUrls({
				...res,
				note:
					'`projects` is empty. The BE gates this field to engineering-department ' +
					'users only; non-engineering callers see this empty array by design — ' +
					'`organisationMembers` still reflects the whole org. For a specific ' +
					"project's data use pulse_list_projects + pulse_get_project.",
			});
		}
		return stripAvatarUrls(res);
	},
};

const OrgMembersInput = z.object({
	reportsTo: z.string().optional().describe('Filter to members reporting to this userId.'),
	page: z.number().int().min(1).default(1),
	// The BE rejects limit < 10 despite the OpenAPI spec saying otherwise
	// (observed during Cowork v1.3 smoke test, Apr 2026). Enforcing the real
	// minimum here so the first call never 400s.
	limit: z.number().int().min(10).max(100).default(20),
});

export const listOrgMembersTool: ToolDefinition<typeof OrgMembersInput> = {
	name: 'pulse_list_org_members',
	description: 'Org members with rolled-up activity (paginated). (See instructions.ts.)',
	inputSchema: OrgMembersInput,
	handler: async (args, ctx) =>
		stripAvatarUrls(
			await ctx.api.request({
				method: 'GET',
				path: '/activity/members',
				query: { reportsTo: args.reportsTo, page: args.page, limit: args.limit },
			})
		),
};

const MemberProfileInput = z.object({
	userId: z.string().uuid().describe('Pulse user UUID.'),
	range: z
		.enum(['7 days', '30 days', '1 year'])
		.default('30 days')
		.describe(
			'Activity window. As of PX-3537 (Jun 2026) the BE returns projects + ' +
				'repositories the user was ACTIVE IN during this window (Jira ticket ' +
				"transitions + GitHub commits/PRs), NOT formal project assignments. " +
				"Default '30 days' matches the Pulse FE Activity page default."
		),
	customRange: z
		.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
		.length(2)
		.optional()
		.describe('Custom [startISO, endISO] window. Overrides range when set.'),
});

/** Rewrite DD-MM-YYYY strings to ISO YYYY-MM-DD; pass everything else through. */
function dmyToIso(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	const m = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
	return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
}

/** Deep-walk an object/array and convert DD-MM-YYYY date fields to ISO. */
function normaliseDates(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normaliseDates);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = /date|Date$/i.test(k) ? dmyToIso(v) : normaliseDates(v);
		}
		return out;
	}
	return value;
}

export const getMemberProfileTool: ToolDefinition<typeof MemberProfileInput> = {
	name: 'pulse_get_member_profile',
	description: "One member's cross-project metrics. (See instructions.ts.)",
	inputSchema: MemberProfileInput,
	handler: async (args, ctx) => {
		const res = await ctx.api.request({
			method: 'GET',
			path: `/activity/profile/${args.userId}`,
			query: {
				range: args.customRange ? undefined : args.range,
				customRange: args.customRange,
			},
		});
		// BE returns date fields in DD-MM-YYYY for this endpoint while every other
		// tool returns ISO. Normalise at the edge so callers see one shape. Also
		// strip avatar URLs (this response embeds the user object and every
		// reportee).
		return stripAvatarUrls(normaliseDates(res));
	},
};

/**
 * Per-member metric tools — wrap the /activity/* metric endpoints.
 *
 * The BE exposes 8 individual-scoped metric endpoints (code-commit, pr,
 * pr-comments + details, ftp, line-of-code, rca + details + trends) that
 * answer questions like "what's their FTP rate" or "how many commits have
 * they made this month". We unify them into two tools to keep the surface
 * tight, mirroring the `pulse_get_dev_process_metric` pattern:
 *
 *   - pulse_get_member_metric     — code-commit / pr / pr-comments / ftp /
 *                                   line-of-code (single category enum,
 *                                   shared param shape)
 *   - pulse_get_member_rca        — rca / rca/details / rca/trends
 *                                   (variant enum)
 *
 * All endpoints accept optional `range` and `userId`. ProjectIds are
 * required for the FTP and RCA family (BE rejects empty arrays); the
 * commit / PR / line-of-code endpoints accept repoIds instead.
 */

const MEMBER_METRIC_CATEGORIES = [
	'CODE_COMMIT',
	'PR',
	'PR_COMMENTS',
	'FTP',
	'LINE_OF_CODE',
] as const;

const MEMBER_METRIC_TO_PATH: Record<string, string> = {
	CODE_COMMIT: '/activity/code-commit',
	PR: '/activity/pr',
	PR_COMMENTS: '/activity/pr-comments',
	FTP: '/activity/ftp',
	LINE_OF_CODE: '/activity/line-of-code',
};

const MemberMetricInput = z.object({
	userId: z
		.string()
		.uuid()
		.describe(
			'Pulse user UUID. Resolve via pulse_find_user when given a name. ' +
				'Default-omitted = the authenticated caller.'
		)
		.optional(),
	category: z.enum(MEMBER_METRIC_CATEGORIES).describe(
		'Which per-member metric to fetch. CODE_COMMIT = commit frequency, ' +
			'PR = PR raised count, PR_COMMENTS = review comments, FTP = first-time ' +
			'pass rate (requires projectIds[]), LINE_OF_CODE = lines added/removed.'
	),
	range: z
		.enum(['7 days', '30 days', '1 year'])
		.default('30 days')
		.describe('Date range. Ignored if customRange is supplied.'),
	customRange: z
		.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
		.length(2)
		.optional()
		.describe('Custom [start, end] window in YYYY-MM-DD. Overrides range.'),
	repoIds: z
		.array(z.string())
		.optional()
		.describe('Optional repo filter for CODE_COMMIT / PR / PR_COMMENTS / LINE_OF_CODE.'),
	projectIds: z
		.array(z.string().uuid())
		.optional()
		.describe('Required for FTP. Optional for the others. Auto-fetched from member profile if omitted for FTP.'),
	includeDetails: z
		.boolean()
		.default(false)
		.describe(
			'PR_COMMENTS only — fetches the per-PR detail rows (paginated). ' +
				'Requires page + limit. Other categories ignore this flag.'
		),
	page: z.number().int().min(1).optional().describe('Required for PR_COMMENTS + includeDetails.'),
	limit: z.number().int().min(1).optional().describe('Required for PR_COMMENTS + includeDetails.'),
});

type MemberMetricArgs = z.infer<typeof MemberMetricInput>;

function buildMemberMetricQuery(args: MemberMetricArgs): Record<string, unknown> {
	return {
		userId: args.userId,
		range: args.customRange ? undefined : args.range,
		customRange: args.customRange,
		repoIds: args.repoIds,
		projectIds: args.projectIds,
		page: args.page,
		limit: args.limit,
	};
}

interface MemberContext {
	projectIds: string[];
	repoIds: string[];
}

/**
 * Resolve the projectIds[] AND repoIds[] for a member from their profile.
 *
 * The /activity/* metric endpoints split awkwardly along this axis:
 *   - FTP, RCA: scoped by projectIds[] (BE rejects empty)
 *   - PR, CODE_COMMIT, PR_COMMENTS, LINE_OF_CODE: scoped by repoIds[]
 *     (BE returns success with NO `data` payload when missing — silent zero)
 *
 * Without this auto-fetch the per-member tools "work" but return empty
 * results across the board, which an LLM consumer can't distinguish from
 * a real zero. Fetching from the profile gives us both lists in a single
 * request — projects[].repositories[].id has everything we need.
 *
 * Cached at the tool layer via the api client's request cache (if any);
 * called at most once per tool invocation regardless of category.
 */
/**
 * Date scope for auto-fetching member context. Callers (metric / RCA tools)
 * pass their own range / customRange through so the auto-fetched projectIds
 * cover the same window as the metric being queried. Without this the
 * auto-fetch would default to "last 30 days" while the metric asked for
 * "last year" — giving an empty intersection for anyone whose contributions
 * are >30 days old.
 */
interface MemberContextDateArgs {
	range?: string;
	customRange?: string[];
}

async function getMemberContext(
	api: ToolContext['api'],
	userId: string,
	dateArgs: MemberContextDateArgs = {}
): Promise<MemberContext> {
	const profile = (await api.request({
		method: 'GET',
		path: `/activity/profile/${userId}`,
		query: {
			// BE requires range OR customRange since PX-3537. Mirror the metric
			// tool's date scope so the auto-fetched projectIds match the window
			// the caller actually cares about. Default to '30 days' when caller
			// supplied neither — matches the FE.
			range: dateArgs.customRange ? undefined : (dateArgs.range ?? '30 days'),
			customRange: dateArgs.customRange,
		},
	})) as {
		data?: {
			projects?: Array<{
				id?: string;
				repositories?: Array<{ id?: string }>;
			}>;
		};
	};
	const projects = profile?.data?.projects ?? [];
	const projectIds = projects
		.map((p) => p?.id)
		.filter((id): id is string => typeof id === 'string');
	const repoIds = projects
		.flatMap((p) => p?.repositories ?? [])
		.map((r) => r?.id)
		.filter((id): id is string => typeof id === 'string');
	// De-dupe — a repo could appear under more than one project.
	return { projectIds, repoIds: Array.from(new Set(repoIds)) };
}

/**
 * Repo-scoped categories: BE returns success with NO `data` payload when
 * `repoIds[]` is missing. Silent zero — indistinguishable from "this user
 * really has zero PRs" without auto-fetching the scope.
 */
const REPO_SCOPED_CATEGORIES = new Set(['CODE_COMMIT', 'PR', 'PR_COMMENTS', 'LINE_OF_CODE']);

function needsScopeAutoFetch(args: MemberMetricArgs): boolean {
	if (!args.userId) return false;
	if (REPO_SCOPED_CATEGORIES.has(args.category)) {
		return !args.repoIds || args.repoIds.length === 0;
	}
	if (args.category === 'FTP') {
		return !args.projectIds || args.projectIds.length === 0;
	}
	return false;
}

function resolveMemberMetricPath(args: MemberMetricArgs): string {
	const isDetails = args.category === 'PR_COMMENTS' && args.includeDetails;
	if (isDetails && (!args.page || !args.limit)) {
		throw new Error(
			'pulse_get_member_metric: PR_COMMENTS + includeDetails requires page + limit.'
		);
	}
	const basePath = MEMBER_METRIC_TO_PATH[args.category];
	return isDetails ? `${basePath}/details` : basePath;
}

export const getMemberMetricTool: ToolDefinition<typeof MemberMetricInput> = {
	name: 'pulse_get_member_metric',
	description:
		'Per-member dev/QA metric (CODE_COMMIT, PR, PR_COMMENTS, FTP, LINE_OF_CODE). ' +
		'(See instructions.ts.)',
	inputSchema: MemberMetricInput,
	handler: async (args, ctx) => {
		// Auto-fetch repos + projects from the profile when scope is missing —
		// repo-scoped categories silent-zero on the BE without repoIds[], and
		// FTP outright rejects empty projectIds[]. Inherit this call's date
		// scope so the auto-fetched set matches the window the metric covers
		// (BE is now activity-window-scoped per PX-3537).
		const memberCtx = needsScopeAutoFetch(args)
			? await getMemberContext(ctx.api, args.userId as string, {
					range: args.range,
					customRange: args.customRange,
				})
			: null;
		const repoIds =
			args.repoIds && args.repoIds.length > 0 ? args.repoIds : memberCtx?.repoIds;
		const projectIds =
			args.projectIds && args.projectIds.length > 0
				? args.projectIds
				: memberCtx?.projectIds;

		return ctx.api.request({
			method: 'GET',
			path: resolveMemberMetricPath(args),
			query: { ...buildMemberMetricQuery(args), repoIds, projectIds },
		});
	},
};

const MEMBER_RCA_VARIANTS = ['overview', 'details', 'trends'] as const;

const MemberRcaInput = z
	.object({
		userId: z.string().uuid().optional(),
		variant: z.enum(MEMBER_RCA_VARIANTS).default('overview').describe(
			'overview = aggregated RCA categories; details = per-bug RCA breakdown; ' +
				'trends = time-series for one RCA category (requires `category`).'
		),
		projectIds: z
			.array(z.string().uuid())
			.min(1)
			.optional()
			.describe(
				'Project UUIDs. Required by all variants. Auto-fetched from the member ' +
					'profile when userId is supplied and projectIds is empty.'
			),
		category: z
			.string()
			.optional()
			.describe(
				'RCA category name (e.g. "Inadequate Unit testing", "Requirement Understanding gap"). ' +
					'Required for variant=trends. Use the exact label from a previous RCA overview response.'
			),
		range: z.enum(['7 days', '30 days', '1 year']).default('30 days'),
		customRange: z
			.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
			.length(2)
			.optional(),
	})
	.refine((v) => v.variant !== 'trends' || !!v.category, {
		message: 'variant=trends requires `category`.',
		path: ['category'],
	});

const MEMBER_RCA_PATH: Record<(typeof MEMBER_RCA_VARIANTS)[number], string> = {
	overview: '/activity/rca',
	details: '/activity/rca/details',
	trends: '/activity/rca/trends',
};

/**
 * Walks an RCA response and prefixes any bare-numeric `rcaId` field with
 * `jira_rca_`. Idempotent: already-prefixed values pass through unchanged.
 * See Cowork feedback 2026-05-14, issue #30.
 */
function prefixRcaIds<T>(value: T): T {
	if (Array.isArray(value)) return value.map(prefixRcaIds) as unknown as T;
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (k === 'rcaId' && typeof v === 'string' && /^\d+$/.test(v)) {
				out[k] = `jira_rca_${v}`;
			} else {
				out[k] = prefixRcaIds(v);
			}
		}
		return out as unknown as T;
	}
	return value;
}

export const getMemberRcaTool: ToolDefinition<typeof MemberRcaInput> = {
	name: 'pulse_get_member_rca',
	description:
		"Per-member Root Cause Analysis (overview / details / trends). (See instructions.ts.)",
	inputSchema: MemberRcaInput,
	handler: async (args, ctx) => {
		// Auto-fetch projectIds[] from the member profile when omitted.
		// Inherit this call's date scope so the auto-fetched set matches the
		// window the RCA covers (BE is now activity-window-scoped per PX-3537).
		const needsAutoFetch =
			(!args.projectIds || args.projectIds.length === 0) && !!args.userId;
		const memberCtx = needsAutoFetch
			? await getMemberContext(ctx.api, args.userId as string, {
					range: args.range,
					customRange: args.customRange,
				})
			: null;
		const projectIds =
			args.projectIds && args.projectIds.length > 0
				? args.projectIds
				: memberCtx?.projectIds;
		if (!projectIds || projectIds.length === 0) {
			throw new Error(
				'pulse_get_member_rca: projectIds[] is required. ' +
					'Either pass projectIds, or pass userId so the tool can fetch them ' +
					'from the member profile.'
			);
		}

		const res = await ctx.api.request({
			method: 'GET',
			path: MEMBER_RCA_PATH[args.variant],
			query: {
				userId: args.userId,
				projectIds,
				range: args.customRange ? undefined : args.range,
				customRange: args.customRange,
				category: args.category,
			},
		});
		// Prefix bare-numeric `rcaId` strings with `jira_rca_` so they match the
		// `jira_sprint_*`, `jira_release_*` etc convention used elsewhere in the
		// Pulse data model.
		return prefixRcaIds(res);
	},
};
