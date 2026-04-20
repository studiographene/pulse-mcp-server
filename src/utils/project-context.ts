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
