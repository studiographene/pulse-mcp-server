import { PulseApiClient } from '../api/client';

/**
 * Sprint auto-fetch helper.
 *
 * Several BE endpoints (`/metrics/qa/*`, `/metrics/pm/estimates-vs-actuals`,
 * `/cycle-time/*`) treat sprint scope as required-but-not-validated: omitting
 * the filter is accepted as a 200, but the response is empty. The FE always
 * supplies sprints because the dashboard has a sprint selector; LLM callers
 * forget. To match the FE's effective contract we auto-fill the most-recent
 * N sprints when the caller didn't supply any.
 *
 * `pulse_get_cycle_time` has used this pattern since v1; this util extracts
 * it so qa_metric / qa_rca / estimates_vs_actuals can share the same
 * implementation rather than each tool reaching for `/projects/.../jira/boards`
 * separately. See the audit at PX-3685 v1.3 follow-up.
 */

interface RawBoardsResponse {
	data?: {
		boards: Array<{
			sprints: Array<{ id: string; startDate: string | null }>;
		}>;
	};
}

/**
 * Fetches the project's Jira sprints across all boards, sorts newest-first by
 * `startDate` (sprints with no startDate sort last), and returns the first N
 * IDs. Cheap — one BE call. Errors propagate so callers can surface them.
 */
export async function recentSprintIds(
	api: PulseApiClient,
	projectId: string,
	n: number
): Promise<string[]> {
	const raw = (await api.request({
		method: 'GET',
		path: `/projects/${projectId}/jira/boards`,
	})) as RawBoardsResponse;
	const sprints = (raw?.data?.boards ?? []).flatMap((b) => b.sprints ?? []);
	sprints.sort((a, b) => {
		const ad = a.startDate ? Date.parse(a.startDate) : 0;
		const bd = b.startDate ? Date.parse(b.startDate) : 0;
		return bd - ad;
	});
	return sprints.slice(0, n).map((s) => s.id);
}
