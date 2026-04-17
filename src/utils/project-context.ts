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

const CACHE = new Map<string, { ctx: ProjectContext; fetchedAt: number }>();
const TTL_MS = 5 * 60 * 1000;

function isFresh(fetchedAt: number): boolean {
	return Date.now() - fetchedAt < TTL_MS;
}

function unwrap(raw: unknown): ProjectResponse {
	const maybeWrapped = raw as { data?: ProjectResponse } | ProjectResponse;
	return ('data' in (maybeWrapped as object) && (maybeWrapped as { data?: ProjectResponse }).data
		? (maybeWrapped as { data: ProjectResponse }).data
		: (maybeWrapped as ProjectResponse)) as ProjectResponse;
}

function extractRepoIds(project: ProjectResponse): string[] {
	const github = (project.tools ?? []).find((t) => t.name === 'GITHUB');
	const metas = github?.meta ?? [];
	return metas
		.map((m) => m.integratorId)
		.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export async function getProjectContext(
	api: PulseApiClient,
	projectId: string
): Promise<ProjectContext> {
	const cached = CACHE.get(projectId);
	if (cached && isFresh(cached.fetchedAt)) return cached.ctx;

	const project = unwrap(await api.request({ method: 'GET', path: `/projects/${projectId}` }));
	const ctx: ProjectContext = {
		companyId: project.companyId,
		repoIds: extractRepoIds(project),
	};
	CACHE.set(projectId, { ctx, fetchedAt: Date.now() });
	return ctx;
}
