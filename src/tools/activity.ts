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
	/** Per-project id → name lookup, for building human-readable `_scope` blocks. */
	projectNames: Record<string, string>;
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
				name?: string;
				repositories?: Array<{ id?: string }>;
			}>;
		};
	};
	const projects = profile?.data?.projects ?? [];
	const projectIds = projects
		.map((p) => p?.id)
		.filter((id): id is string => typeof id === 'string');
	const projectNames: Record<string, string> = {};
	for (const p of projects) {
		if (typeof p?.id === 'string' && typeof p?.name === 'string') {
			projectNames[p.id] = p.name;
		}
	}
	const repoIds = projects
		.flatMap((p) => p?.repositories ?? [])
		.map((r) => r?.id)
		.filter((id): id is string => typeof id === 'string');
	// De-dupe — a repo could appear under more than one project.
	return { projectIds, repoIds: Array.from(new Set(repoIds)), projectNames };
}

/**
 * Repo-scoped categories: BE returns success with NO `data` payload when
 * `repoIds[]` is missing. Silent zero — indistinguishable from "this user
 * really has zero PRs" without auto-fetching the scope.
 */
const REPO_SCOPED_CATEGORIES = new Set(['CODE_COMMIT', 'PR', 'PR_COMMENTS', 'LINE_OF_CODE']);

/**
 * Description of what a per-member call actually queried. Attached to every
 * response as a top-level `_scope` block so LLM consumers can always cite
 * (a) which projects/repos were queried, (b) whether the scope was auto-fetched
 * from the member profile or passed explicitly, and (c) which date window
 * was used. Kills a class of "why don't the numbers match" confusion where
 * the model presented a headline without knowing which projects the auto-fetch
 * picked, or which window resolved.
 */
interface ScopeBlock {
	userId?: string;
	window: { range?: string; customRange?: string[] };
	projects: Array<{ id: string; name?: string; source: 'auto-fetched' | 'passed' }>;
	repos?: Array<{ id: string; source: 'auto-fetched' | 'passed' }>;
	note?: string;
}

/** Resolve which IDs were used and whether they came from the caller. */
function resolveIdsAndSource(
	passed: string[] | undefined,
	fallback: string[] | undefined
): { ids: string[]; source: 'auto-fetched' | 'passed' } {
	if (passed && passed.length > 0) return { ids: passed, source: 'passed' };
	return { ids: fallback ?? [], source: 'auto-fetched' };
}

function buildScopeBlock(args: {
	userId?: string;
	range?: string;
	customRange?: string[];
	passedProjectIds?: string[];
	passedRepoIds?: string[];
	memberCtx: MemberContext | null;
	includeRepos: boolean;
}): ScopeBlock {
	const proj = resolveIdsAndSource(args.passedProjectIds, args.memberCtx?.projectIds);
	const scope: ScopeBlock = {
		userId: args.userId,
		window: args.customRange
			? { customRange: args.customRange }
			: { range: args.range ?? '30 days' },
		projects: proj.ids.map((id) => ({
			id,
			name: args.memberCtx?.projectNames?.[id],
			source: proj.source,
		})),
	};

	if (args.includeRepos) {
		const repo = resolveIdsAndSource(args.passedRepoIds, args.memberCtx?.repoIds);
		scope.repos = repo.ids.map((id) => ({ id, source: repo.source }));
	}

	const anyAutoFetched =
		proj.source === 'auto-fetched' || (args.includeRepos && !args.passedRepoIds?.length);
	if (anyAutoFetched) {
		scope.note =
			'Scope was auto-fetched from the member profile. Since PX-3537 (Jun 2026) ' +
			'profile projects reflect what the user was ACTIVE IN during the queried window, ' +
			'NOT formal project assignments. Pass projectIds/repoIds explicitly to override.';
	}

	return scope;
}

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

		const res = await ctx.api.request({
			method: 'GET',
			path: resolveMemberMetricPath(args),
			query: { ...buildMemberMetricQuery(args), repoIds, projectIds },
		});

		// Attach a self-describing `_scope` block so callers (LLMs especially)
		// can always cite which projects/repos + window the numbers came from.
		// See ScopeBlock docstring.
		const scope = buildScopeBlock({
			userId: args.userId,
			range: args.range,
			customRange: args.customRange,
			passedProjectIds: args.projectIds,
			passedRepoIds: args.repoIds,
			memberCtx,
			includeRepos: REPO_SCOPED_CATEGORIES.has(args.category),
		});
		return { ...(res as Record<string, unknown>), _scope: scope };
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

/**
 * Cap on parallel per-project RCA calls for the `_byProject` breakdown.
 * At <= this many projects we fan out to give the caller per-project
 * counts (helps distinguish "filter binds, this project contributes zero"
 * from "filter broken, all data mixed in"). Beyond the cap we skip the
 * breakdown and add an explanatory note.
 */
const RCA_BY_PROJECT_MAX_FANOUT = 5;

interface RcaByProjectRow {
	projectId: string;
	projectName?: string;
	totalBugs: number;
}

/**
 * Fire one aggregate RCA call per projectId in parallel, extract the
 * per-project total from each. Read-only; adds latency proportional to
 * projectIds.length, capped by RCA_BY_PROJECT_MAX_FANOUT at the caller.
 */
async function fetchRcaByProjectBreakdown(
	api: ToolContext['api'],
	baseQuery: Record<string, unknown>,
	projectIds: string[],
	projectNames: Record<string, string>
): Promise<RcaByProjectRow[]> {
	const results = await Promise.all(
		projectIds.map(async (projectId) => {
			try {
				const single = (await api.request({
					method: 'GET',
					path: MEMBER_RCA_PATH.overview,
					query: { ...baseQuery, projectIds: [projectId] },
				})) as { data?: { headline?: { totalBugs?: number } } };
				return {
					projectId,
					projectName: projectNames[projectId],
					totalBugs: single?.data?.headline?.totalBugs ?? 0,
				};
			} catch {
				// One project failing shouldn't blank the whole breakdown.
				return { projectId, projectName: projectNames[projectId], totalBugs: 0 };
			}
		})
	);
	return results.sort((a, b) => b.totalBugs - a.totalBugs);
}

const RCA_SPRINT_ID_META_NOTE =
	'The `sprintId` field on each `tableData` row is per-row navigation ' +
	'metadata for the Jira link (`linkToJira`), NOT the query scope. The ' +
	'query aggregates across the full window in `_scope.window`; the ' +
	'shared sprintId does not mean the query was scoped to a single sprint.';

/**
 * Build the per-project breakdown block for a member RCA response.
 * Only meaningful for `overview` with multiple projects. Returns either the
 * breakdown, an explanatory note (when fanout was skipped), or neither.
 */
async function buildRcaByProjectBlock(
	api: ToolContext['api'],
	variant: 'overview' | 'details' | 'trends',
	projectIds: string[],
	baseQuery: Record<string, unknown>,
	projectNames: Record<string, string>
): Promise<{ byProject?: RcaByProjectRow[]; byProjectNote?: string }> {
	if (variant !== 'overview' || projectIds.length <= 1) return {};
	if (projectIds.length > RCA_BY_PROJECT_MAX_FANOUT) {
		return {
			byProjectNote:
				`Per-project breakdown skipped: ${projectIds.length} projects passed ` +
				`(cap is ${RCA_BY_PROJECT_MAX_FANOUT}). To see per-project counts, ` +
				`query them individually.`,
		};
	}
	return {
		byProject: await fetchRcaByProjectBreakdown(api, baseQuery, projectIds, projectNames),
	};
}

/**
 * Auto-fetch memberCtx when caller omitted projectIds but supplied userId.
 * Returns null when auto-fetch isn't applicable.
 */
async function maybeAutoFetchRcaCtx(
	api: ToolContext['api'],
	args: { userId?: string; projectIds?: string[]; range?: string; customRange?: string[] }
): Promise<MemberContext | null> {
	const needsAutoFetch =
		(!args.projectIds || args.projectIds.length === 0) && !!args.userId;
	if (!needsAutoFetch) return null;
	return getMemberContext(api, args.userId as string, {
		range: args.range,
		customRange: args.customRange,
	});
}

export const getMemberRcaTool: ToolDefinition<typeof MemberRcaInput> = {
	name: 'pulse_get_member_rca',
	description:
		"Per-member Root Cause Analysis (overview / details / trends). Response includes " +
		"a `_scope` block (what was actually queried), a `_byProject` breakdown when " +
		"multiple projects are queried (up to 5), and a `_meta` note explaining that " +
		"the `sprintId` field on each tableData row is per-row Jira-link metadata, NOT " +
		"the query scope. (See instructions.ts.)",
	inputSchema: MemberRcaInput,
	handler: async (args, ctx) => {
		const memberCtx = await maybeAutoFetchRcaCtx(ctx.api, args);
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

		const baseQuery = {
			userId: args.userId,
			range: args.customRange ? undefined : args.range,
			customRange: args.customRange,
			category: args.category,
		};

		const res = await ctx.api.request({
			method: 'GET',
			path: MEMBER_RCA_PATH[args.variant],
			query: { ...baseQuery, projectIds },
		});

		const { byProject, byProjectNote } = await buildRcaByProjectBlock(
			ctx.api,
			args.variant,
			projectIds,
			baseQuery,
			memberCtx?.projectNames ?? {}
		);

		const scope = buildScopeBlock({
			userId: args.userId,
			range: args.range,
			customRange: args.customRange,
			passedProjectIds: args.projectIds,
			memberCtx,
			includeRepos: false,
		});

		// Prefix bare-numeric `rcaId` strings with `jira_rca_` so they match the
		// `jira_sprint_*`, `jira_release_*` etc convention used elsewhere in the
		// Pulse data model.
		const prefixed = prefixRcaIds(res) as Record<string, unknown>;
		return {
			...prefixed,
			_scope: scope,
			...(byProject ? { _byProject: byProject } : {}),
			...(byProjectNote ? { _byProjectNote: byProjectNote } : {}),
			_meta: { sprintIdNote: RCA_SPRINT_ID_META_NOTE },
		};
	},
};
