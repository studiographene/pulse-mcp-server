import { PulseApiClient } from '../api/client';

/**
 * Extracts the contextual fields (companyId, repo IDs) that every metric endpoint
 * actually requires, even though the OpenAPI spec marks them optional.
 *
 * Empirically discovered via smoke test: dev-process and TSC metric endpoints return
 * 500 without repoIds[] + companyId. The FE always fetches the project first and
 * passes these along. We do the same.
 *
 * Small in-memory cache avoids re-fetching the project for every metric call in a
 * multi-tool chain ("show me commits, then PR wait time, then cycle time on X").
 */

export interface ProjectContext {
	companyId: string;
	repoIds: string[];
}

interface ProjectResponse {
	id: string;
	companyId: string;
	tools: Array<{
		name: string;
		meta?: Array<{ integratorId?: string }>;
	}>;
}

interface MaybeWrapped<T> {
	data?: T;
}

const CACHE = new Map<string, { ctx: ProjectContext; fetchedAt: number }>();
const TTL_MS = 5 * 60 * 1000;

function unwrap<T>(raw: unknown): T {
	const maybe = raw as MaybeWrapped<T>;
	return (maybe?.data ?? raw) as T;
}

function extractRepoIds(project: ProjectResponse): string[] {
	const github = (project.tools ?? []).find((t) => t.name === 'GITHUB');
	return (github?.meta ?? [])
		.map((m) => m.integratorId)
		.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export async function getProjectContext(
	api: PulseApiClient,
	projectId: string
): Promise<ProjectContext> {
	const cached = CACHE.get(projectId);
	if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.ctx;

	const project = unwrap<ProjectResponse>(
		await api.request({ method: 'GET', path: `/projects/${projectId}` })
	);
	const ctx: ProjectContext = {
		companyId: project.companyId,
		repoIds: extractRepoIds(project),
	};
	CACHE.set(projectId, { ctx, fetchedAt: Date.now() });
	return ctx;
}

/**
 * Returns the caller's repoIds if non-empty, otherwise auto-fetches them from the
 * project. Used by metric tools that take an optional repoIds array.
 */
export async function resolveRepoIds(
	api: PulseApiClient,
	projectId: string,
	supplied?: string[]
): Promise<string[] | undefined> {
	if (supplied && supplied.length > 0) return supplied;
	const ctx = await getProjectContext(api, projectId);
	return ctx.repoIds;
}

/**
 * Branch priority order, copied verbatim from the FE's `sortByPriority`
 * (projectx-frontend `src/utils/sortByPriority.ts`). The FE picks the first
 * branch in this order that the project actually has and uses it as the
 * default for every Technical-tab metric. We mirror it exactly so the MCP and
 * the Pulse UI resolve the same default branch.
 */
const BRANCH_PRIORITY = ['prod', 'master', 'main', 'uat', 'stage', 'qa', 'dev', 'develop'];

const BRANCH_CACHE = new Map<string, { branch: string | undefined; fetchedAt: number }>();

/**
 * Resolve the default branch for a project the same way the Pulse FE does.
 *
 * Why this exists: the BE's product-security rollup forwards `branch` straight
 * to the downstream technical-metrics service, which returns an all-zero
 * series when no branch is supplied. The FE never hits that path because its
 * BranchesProvider always has a branch selected. The MCP did, which is why
 * `pulse_get_product_security` silently reported 0 / GREEN on projects with
 * hundreds of live findings (PX-3758).
 *
 * Returns undefined when the project has no GitHub branches or the lookup
 * fails, so callers degrade to the previous behaviour rather than erroring.
 */
export async function resolveDefaultBranch(
	api: PulseApiClient,
	projectId: string,
	supplied?: string
): Promise<string | undefined> {
	if (supplied) return supplied;

	const cached = BRANCH_CACHE.get(projectId);
	if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.branch;

	let branch: string | undefined;
	try {
		const raw = await api.request({
			method: 'GET',
			path: `/projects/${projectId}/github-branches`,
		});
		const names = (unwrap<string[]>(raw) ?? []).filter(
			(n): n is string => typeof n === 'string' && n.length > 0
		);
		const lower = new Set(names.map((n) => n.toLowerCase()));
		// No conventional branch name matched — fall back to whatever the
		// project does have rather than sending nothing.
		branch = BRANCH_PRIORITY.find((p) => lower.has(p)) ?? names[0];
	} catch {
		// Branch lookup is best-effort: a failure here must not take down the
		// metric call that needed it.
		branch = undefined;
	}

	BRANCH_CACHE.set(projectId, { branch, fetchedAt: Date.now() });
	return branch;
}
