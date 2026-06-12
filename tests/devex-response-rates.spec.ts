/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Regression cover for pulse_get_devex_response_rates.
 *
 * Wraps GET /devex/response-rate/graph. Three things to lock in:
 *   1. Schema: projectIds[] is required, range defaults to '4 months' (matches
 *      the FE default).
 *   2. Range mapping: compact-form MCP enum is translated to the BE's
 *      English-phrase form just before sending — same convention as the
 *      other devex tools.
 *   3. customRange exclusivity: when customRange is set, `range` is dropped
 *      from the outbound query (the BE rejects requests that send both).
 */

import { getDevExResponseRatesTool } from '../src/tools/devex';
import { ToolContext } from '../src/tools/types';

function mockApi(): { ctx: ToolContext; requests: any[] } {
	const requests: any[] = [];
	return {
		requests,
		ctx: {
			api: {
				request: async (req: any) => {
					requests.push(req);
					return { data: { trends: [], byProject: [], allProjects: 0 } };
				},
			} as any,
		},
	};
}

const projectId = '11111111-1111-1111-1111-111111111111';
const projectId2 = '22222222-2222-2222-2222-222222222222';

describe('pulse_get_devex_response_rates — schema', () => {
	it('requires projectIds[]', () => {
		expect(() => getDevExResponseRatesTool.inputSchema.parse({})).toThrow();
		expect(() =>
			getDevExResponseRatesTool.inputSchema.parse({ projectIds: [] })
		).toThrow();
	});

	it("defaults range to '4 months' (matches FE default)", () => {
		const parsed = getDevExResponseRatesTool.inputSchema.parse({
			projectIds: [projectId],
		});
		expect(parsed.range).toBe('4 months');
	});

	it("accepts all four preset ranges the BE supports", () => {
		for (const range of ['30 days', '4 months', '9 months', '1 year']) {
			expect(() =>
				getDevExResponseRatesTool.inputSchema.parse({ projectIds: [projectId], range })
			).not.toThrow();
		}
	});

	it("rejects ranges the BE doesn't accept for response rates", () => {
		expect(() =>
			getDevExResponseRatesTool.inputSchema.parse({
				projectIds: [projectId],
				range: '7 days',
			})
		).toThrow();
	});

	it('rejects malformed customRange (not ISO date)', () => {
		expect(() =>
			getDevExResponseRatesTool.inputSchema.parse({
				projectIds: [projectId],
				customRange: ['01-01-2024', '01-06-2026'],
			})
		).toThrow();
	});
});

describe('pulse_get_devex_response_rates — handler', () => {
	it("hits /devex/response-rate/graph and translates '4 months' → 'last 3 months'", async () => {
		const { ctx, requests } = mockApi();
		const args = getDevExResponseRatesTool.inputSchema.parse({
			projectIds: [projectId, projectId2],
		});
		await getDevExResponseRatesTool.handler(args, ctx);
		expect(requests).toHaveLength(1);
		expect(requests[0].method).toBe('GET');
		expect(requests[0].path).toBe('/devex/response-rate/graph');
		expect(requests[0].query.projectIds).toEqual([projectId, projectId2]);
		expect(requests[0].query.range).toBe('last 3 months');
		expect(requests[0].query.customRange).toBeUndefined();
	});

	it.each([
		['30 days', 'last 1 month'],
		['4 months', 'last 3 months'],
		['9 months', 'last 9 months'],
		['1 year', 'last 1 year'],
	])('translates compact-form %s → API-form %s', async (compact, api) => {
		const { ctx, requests } = mockApi();
		const args = getDevExResponseRatesTool.inputSchema.parse({
			projectIds: [projectId],
			range: compact,
		});
		await getDevExResponseRatesTool.handler(args, ctx);
		expect(requests[0].query.range).toBe(api);
	});

	it('drops range when customRange is supplied (BE rejects both)', async () => {
		const { ctx, requests } = mockApi();
		const args = getDevExResponseRatesTool.inputSchema.parse({
			projectIds: [projectId],
			range: '1 year',
			customRange: ['2024-01-01', '2026-06-01'],
		});
		await getDevExResponseRatesTool.handler(args, ctx);
		expect(requests[0].query.customRange).toEqual(['2024-01-01', '2026-06-01']);
		expect(requests[0].query.range).toBeUndefined();
	});
});
