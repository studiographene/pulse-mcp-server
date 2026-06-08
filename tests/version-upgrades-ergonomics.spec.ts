/**
 * Regression cover for the version-upgrades tool ergonomics fix.
 *
 * Two concerns:
 *
 *   1. The BE only returns `releasedSince` as a human-readable string
 *      ("3 days", "1 week 4 days"). LLM consumers asking for "released > N
 *      days" need to parse that string, which they get wrong. The tool now
 *      adds a numeric `releasedDaysAgo` per row so the filter is exact.
 *
 *   2. The legacy `type: [table, graph]` enum was a no-op at the BE level
 *      and `includeDetails` was the actual switch to the per-library list.
 *      The tool now exposes `view: [rollup, breakdown]` matching the FE
 *      mental model and keeps `includeDetails` working for backwards compat.
 */

import { enrichVersionUpgradeRowsWithDaysAgo } from '../src/tools/technical';

describe('enrichVersionUpgradeRowsWithDaysAgo', () => {
	// Pin "now" so the maths is deterministic.
	const NOW = Date.parse('2026-06-05T12:00:00.000Z');

	it('adds releasedDaysAgo to every row that has a valid releaseDate', () => {
		const input = {
			data: {
				data: [
					{ libName: 'lodash', releaseDate: '2026-05-21T00:00:00.000Z' },
					{ libName: 'react', releaseDate: '2025-12-01T00:00:00.000Z' },
					{ libName: 'fresh', releaseDate: '2026-06-04T12:00:00.000Z' },
				],
			},
		};
		const out = enrichVersionUpgradeRowsWithDaysAgo(input, NOW) as {
			data: { data: Array<{ libName: string; releasedDaysAgo: number }> };
		};
		expect(out.data.data[0]).toMatchObject({ libName: 'lodash', releasedDaysAgo: 15 });
		expect(out.data.data[1]).toMatchObject({ libName: 'react', releasedDaysAgo: 186 });
		expect(out.data.data[2]).toMatchObject({ libName: 'fresh', releasedDaysAgo: 1 });
	});

	it('leaves rows without releaseDate untouched (no NaN field)', () => {
		const input = { data: { data: [{ libName: 'no-date' }] } };
		const out = enrichVersionUpgradeRowsWithDaysAgo(input, NOW) as {
			data: { data: Array<Record<string, unknown>> };
		};
		expect(out.data.data[0]).toEqual({ libName: 'no-date' });
		expect('releasedDaysAgo' in out.data.data[0]).toBe(false);
	});

	it('handles unparseable releaseDate strings gracefully', () => {
		const input = { data: { data: [{ libName: 'bad', releaseDate: 'not-a-date' }] } };
		const out = enrichVersionUpgradeRowsWithDaysAgo(input, NOW) as {
			data: { data: Array<Record<string, unknown>> };
		};
		expect(out.data.data[0]).toEqual({ libName: 'bad', releaseDate: 'not-a-date' });
		expect('releasedDaysAgo' in out.data.data[0]).toBe(false);
	});

	it('preserves the rest of the response shape (rollup metadata, sibling keys)', () => {
		const input = {
			statusCode: 200,
			message: 'Success',
			data: {
				totalPages: 5,
				page: 1,
				data: [{ libName: 'lodash', releaseDate: '2026-05-21T00:00:00.000Z' }],
			},
		};
		const out = enrichVersionUpgradeRowsWithDaysAgo(input, NOW) as Record<string, unknown>;
		expect(out.statusCode).toBe(200);
		expect(out.message).toBe('Success');
		expect((out.data as Record<string, unknown>).totalPages).toBe(5);
		expect((out.data as Record<string, unknown>).page).toBe(1);
	});

	it('handles empty / malformed inputs without throwing', () => {
		expect(enrichVersionUpgradeRowsWithDaysAgo(null, NOW)).toBeNull();
		expect(enrichVersionUpgradeRowsWithDaysAgo(undefined, NOW)).toBeUndefined();
		expect(enrichVersionUpgradeRowsWithDaysAgo({}, NOW)).toEqual({});
		expect(enrichVersionUpgradeRowsWithDaysAgo({ data: { data: [] } }, NOW)).toEqual({
			data: { data: [] },
		});
	});
});
