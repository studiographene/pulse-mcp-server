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

interface SprintInfo {
	id: string;
	name?: string;
	startDate: string | null;
	endDate?: string | null;
}

interface RawBoardsResponse {
	data?: {
		boards: Array<{
			sprints: Array<SprintInfo>;
		}>;
	};
}

/**
 * Sprints whose name matches this regex are considered hotfix / point-release
 * sprints. They usually carry zero or near-zero working content (a single bug
 * fix, no story work) and dragging them into a project's headline metrics
 * pulls signal out. See Cowork feedback 2026-05-14, issue #8 — Telsen's three
 * most recent sprints by date are all `[Hotfix]` sprints; auto-filling them
 * gave empty `estimates-vs-actuals` and `qa_metric` headlines for a project
 * that has plenty of meaningful work in the previous-meaningful sprint.
 */
const HOTFIX_NAME_RE = /\bhot[\s-]?fix(es)?\b/i;

/**
 * Minimum duration for a sprint to count as "meaningful work" for auto-fill.
 * 72 h excludes 1-day and 2-day patch sprints, which are typically dominated
 * by a single bug fix and have no story estimates.
 */
const MIN_MEANINGFUL_SPRINT_MS = 72 * 60 * 60 * 1000;

function isMeaningfulSprint(s: SprintInfo): boolean {
	if (s.name && HOTFIX_NAME_RE.test(s.name)) return false;
	if (s.startDate && s.endDate) {
		const dur = Date.parse(s.endDate) - Date.parse(s.startDate);
		if (dur > 0 && dur < MIN_MEANINGFUL_SPRINT_MS) return false;
	}
	return true;
}

/**
 * Fetches the project's Jira sprints across all boards, sorts newest-first by
 * `startDate` (sprints with no startDate sort last), filters out hotfix and
 * very-short sprints, and returns the first N IDs.
 *
 * Filtering rationale: see `isMeaningfulSprint`. If filtering would leave
 * fewer than N sprints, fall back to the unfiltered list — better to return
 * slightly noisy data than to return nothing.
 *
 * One BE call. Errors propagate so callers can surface them.
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
	const filtered = sprints.filter(isMeaningfulSprint);
	const source = filtered.length >= n ? filtered : sprints;
	return source.slice(0, n).map((s) => s.id);
}
