/**
 * Response-compaction utilities.
 *
 * The Pulse BE was built for a web UI and returns fields (avatar URLs, long
 * descriptive strings) that inflate token usage when an LLM consumes them.
 * These helpers strip heavyweight fields at the MCP boundary so callers see
 * clean, dense JSON. See PX-3685 v1.3 Cowork-test report.
 */

/** Fields that carry full Cloudinary / avatar URLs (~500+ chars each). */
const AVATAR_FIELD_NAMES: ReadonlySet<string> = new Set([
	'profilePic',
	'profilePicUrl',
	'avatar',
	'avatarUrl',
	'photoUrl',
]);

/** Response-format options for tools that can return large payloads. */
export type ResponseFormat = 'summary' | 'full';

/** How many items of a long array to keep as a sample in summary mode. */
export const SUMMARY_SAMPLE_SIZE = 5;

/**
 * Arrays shorter than this are never summarised (assumed already concise).
 *
 * Set just above SUMMARY_SAMPLE_SIZE: any array longer than the sample we
 * would return gets collapsed. The previous threshold of 20 left mid-size
 * arrays (10–19 elements) uncompressed, which produced 60 KB+ responses for
 * cycle-time details on real projects and overflowed the LLM tool-result
 * budget (Cowork feedback 2026-05-14, issue #1).
 */
export const SUMMARY_MIN_LENGTH = SUMMARY_SAMPLE_SIZE + 1;

/**
 * Deep-walk a response and strip avatar URL fields. Returns a new object —
 * never mutates the input. Preserves array order, key order, and every non-
 * avatar field exactly.
 *
 * Cost: ~O(n) over the serialised size of the payload. Negligible vs. the
 * 10–20k tokens these fields would otherwise consume.
 */
export function stripAvatarUrls<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(stripAvatarUrls) as unknown as T;
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (!AVATAR_FIELD_NAMES.has(k)) {
				out[k] = stripAvatarUrls(v);
			}
		}
		return out as unknown as T;
	}
	return value;
}

/**
 * Deep-walk a response and collapse long arrays into `{ count, sample[], truncated: true }`.
 * Used by tools whose full responses blow past LLM token budgets (tech_audit,
 * cycle_time details, version_upgrades details — see Cowork v1.3 smoke report).
 *
 * Behaviour:
 *   - Arrays of length >= SUMMARY_MIN_LENGTH become a 3-field summary object
 *   - Shorter arrays are recursed into but kept intact
 *   - Non-array values are recursed into, not modified
 *
 * Callers should expose this via a `responseFormat: 'summary' | 'full'` arg
 * and default to `full` for backwards compat; LLMs can opt into summary when
 * the tool is known to blow the budget.
 */
export function summariseLongArrays<T>(value: T): T {
	if (Array.isArray(value)) {
		if (value.length >= SUMMARY_MIN_LENGTH) {
			return {
				count: value.length,
				sample: value.slice(0, SUMMARY_SAMPLE_SIZE).map(summariseLongArrays),
				truncated: true,
			} as unknown as T;
		}
		return value.map(summariseLongArrays) as unknown as T;
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = summariseLongArrays(v);
		}
		return out as unknown as T;
	}
	return value;
}
