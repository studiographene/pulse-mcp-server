/**
 * Regression coverage for the Cowork smoke-test feedback batch (2026-05-14).
 * Each test maps to a specific feedback item by number — see the matching
 * comment in src/ for the production code.
 */

import type { PulseApiClient } from '../src/api/client';
import { summariseLongArrays, SUMMARY_MIN_LENGTH, SUMMARY_SAMPLE_SIZE } from '../src/tools/util/compact';
import { getDevExSummaryTool } from '../src/tools/devex';
import { recentSprintIds } from '../src/utils/sprint-context';
import { getQaMetricTool } from '../src/tools/qa';
import { getUrlScanTool, listProjectUrlsTool } from '../src/tools/technical';
import { getProjectTool } from '../src/tools/projects';
import { getMemberRcaTool } from '../src/tools/activity';
import { getTechAuditTool } from '../src/tools/tech-audit';

interface Captured {
	method?: string;
	path?: string;
	query?: Record<string, unknown>;
	body?: unknown;
}

function mockApi(responder: (opts: Captured) => unknown): {
	api: PulseApiClient;
	captured: Captured[];
} {
	const captured: Captured[] = [];
	let i = 0;
	const api = {
		request: async (opts: Captured): Promise<unknown> => {
			captured.push(opts);
			void i++;
			return responder(opts);
		},
	} as unknown as PulseApiClient;
	return { api, captured };
}

const PROJECT_ID = '57db30ad-e3ba-4eae-8b1b-5e427c6cae33';

describe('Cowork feedback fixes (2026-05-14)', () => {
	describe('#1 cycle-time details summary collapse', () => {
		it('collapses arrays just above sample size (threshold lowered from 20 to 6)', () => {
			expect(SUMMARY_MIN_LENGTH).toBe(SUMMARY_SAMPLE_SIZE + 1);
			const long = Array.from({ length: 10 }, (_, i) => ({ idx: i, payload: 'x'.repeat(500) }));
			const out = summariseLongArrays({ data: long }) as unknown as {
				data: { count: number; sample: unknown[]; truncated: boolean };
			};
			expect(out.data.count).toBe(10);
			expect(out.data.truncated).toBe(true);
			expect(out.data.sample).toHaveLength(SUMMARY_SAMPLE_SIZE);
		});
	});

	describe('#4 + #22 devex_summary averageScore excludes no-response dimensions', () => {
		it('averageScore reflects only contributing dimensions, not zero-bucket ones', async () => {
			const { api } = mockApi((opts) => {
				const type = (opts.path ?? '').split('/').pop() ?? '';
				// 4 dimensions have real responses, the other 9 have all-zero buckets.
				const SCORED = new Set([
					'overall_feedback',
					'focus_n_flow',
					'feedback_n_review_quality',
					'review_timelines',
				]);
				const allZero = {
					stronglyDisagree: 0,
					disagree: 0,
					neutral: 0,
					agree: 0,
					stronglyAgree: 0,
				};
				const realResponses = { ...allZero, agree: 60, stronglyAgree: 20, neutral: 20 };
				return {
					data: {
						questionCategory: type,
						score: SCORED.has(type) ? 75 : 0,
						graph: SCORED.has(type) ? realResponses : allZero,
					},
				};
			});
			const res = (await getDevExSummaryTool.handler(
				{ projectId: PROJECT_ID, range: '30 days', includeComments: false, commentsLimit: 10 },
				{ api } as never
			)) as {
				summary: {
					averageScore: number;
					dimensionsContributing: number;
					dimensionsNoResponses: string[];
				};
				dimensions: Record<string, { hasData?: boolean }>;
			};
			expect(res.summary.dimensionsContributing).toBe(4);
			expect(res.summary.averageScore).toBe(75);
			expect(res.summary.dimensionsNoResponses).toHaveLength(9);
			// hasData flag surfaces on every dimension for #22.
			const overall = res.dimensions.overall_feedback;
			expect(overall.hasData).toBe(true);
			const empty = res.dimensions.tooling_satisfaction;
			expect(empty.hasData).toBe(false);
		});
	});

	describe('#8 sprint auto-fill skips hotfix and short sprints', () => {
		it('filters out [Hotfix] named sprints and <72h durations', async () => {
			const { api } = mockApi(() => ({
				data: {
					boards: [
						{
							sprints: [
								{
									id: 'jira_sprint_7882',
									name: 'v7.8.2 [Hotfix]',
									startDate: '2026-05-12T07:00:00Z',
									endDate: '2026-05-13T22:00:00Z',
								},
								{
									id: 'jira_sprint_7948',
									name: 'v7.8.1 [Hotfix]',
									startDate: '2026-05-11T09:00:00Z',
									endDate: '2026-05-11T22:00:00Z',
								},
								{
									id: 'jira_sprint_9076',
									name: 'v7.9.0',
									startDate: '2026-05-01T04:00:00Z',
									endDate: '2026-06-01T17:00:00Z',
								},
								{
									id: 'jira_sprint_9176',
									name: 'v7.7.1 [Hotfix]',
									startDate: '2026-04-23T03:00:00Z',
									endDate: '2026-04-23T22:00:00Z',
								},
								{
									id: 'jira_sprint_8314',
									name: 'v7.8.0',
									startDate: '2026-04-09T08:00:00Z',
									endDate: '2026-05-14T17:00:00Z',
								},
							],
						},
					],
				},
			}));
			const ids = await recentSprintIds(api, PROJECT_ID, 2);
			expect(ids).toEqual(['jira_sprint_9076', 'jira_sprint_8314']);
		});

		it('falls back to the unfiltered list when filtering leaves too few sprints', async () => {
			const { api } = mockApi(() => ({
				data: {
					boards: [
						{
							sprints: [
								{
									id: 'jira_sprint_a',
									name: 'patch [Hotfix]',
									startDate: '2026-05-01T00:00:00Z',
									endDate: '2026-05-02T00:00:00Z',
								},
								{
									id: 'jira_sprint_b',
									name: 'patch2 [Hotfix]',
									startDate: '2026-04-01T00:00:00Z',
									endDate: '2026-04-02T00:00:00Z',
								},
							],
						},
					],
				},
			}));
			const ids = await recentSprintIds(api, PROJECT_ID, 3);
			// Filter removes both, but fallback returns them anyway — better than empty.
			expect(ids).toEqual(['jira_sprint_a', 'jira_sprint_b']);
		});
	});

	describe('#11 QA contributingSprints', () => {
		it('counts non-GREY sprints and lists GREY sprint names', async () => {
			const { api } = mockApi((opts) => {
				if ((opts.path ?? '').endsWith('/jira/boards')) {
					return {
						data: {
							boards: [
								{
									sprints: [
										{
											id: 'jira_sprint_9209',
											name: 'Sprint A',
											startDate: '2026-04-23T00:00:00Z',
											endDate: '2026-05-14T00:00:00Z',
										},
									],
								},
							],
						},
					};
				}
				return {
					data: {
						headline: { percentValue: 93.33 },
						graphData: [
							{ sprintName: 'Devex Page Build', total: 15, region: 'AMBER' },
							{ sprintName: 'Devex Improvement', total: 0, region: 'GREY' },
							{ sprintName: 'BE Tech Debts', total: 0, region: 'GREY' },
						],
						region: 'AMBER',
					},
				};
			});
			const res = (await getQaMetricTool.handler(
				{
					projectId: PROJECT_ID,
					category: 'FIRST_TIME_PASS_RATE',
					type: 'table',
					includeDetails: false,
				},
				{ api } as never
			)) as {
				_contributingSprints?: { contributing: number; total: number; greyed: string[] };
			};
			expect(res._contributingSprints).toEqual({
				contributing: 1,
				total: 3,
				greyed: ['Devex Improvement', 'BE Tech Debts'],
			});
		});
	});

	describe('#7 url_scan normalises both shapes to object-keyed', () => {
		it('list_project_urls converts array-form mobile/desktop to object form', async () => {
			const { api } = mockApi(() => ({
				data: {
					urls: [
						{
							id: 'u1',
							url: 'https://example.com',
							pageSpeedInfo: {
								mobile: [
									{ category: 'SEO', value: 91, status: 'GREEN' },
									{ category: 'Performance', value: 56, status: 'AMBER' },
									{ category: 'Best Practices', value: 96, status: 'GREEN' },
								],
								desktop: [
									{ category: 'SEO', value: 91, status: 'GREEN' },
									{ category: 'Performance', value: 73, status: 'AMBER' },
								],
								createdAt: '2026-05-09',
							},
						},
					],
				},
			}));
			const res = (await listProjectUrlsTool.handler(
				{ projectId: PROJECT_ID },
				{ api } as never
			)) as {
				data: {
					urls: Array<{
						pageSpeedInfo: {
							mobile: Record<string, { value: number; status: string }>;
							desktop: Record<string, { value: number; status: string }>;
						};
					}>;
				};
			};
			const { mobile, desktop } = res.data.urls[0].pageSpeedInfo;
			expect(mobile.seo).toEqual({ value: 91, status: 'GREEN' });
			expect(mobile.performance).toEqual({ value: 56, status: 'AMBER' });
			expect(mobile.bestPractices).toEqual({ value: 96, status: 'GREEN' });
			expect(desktop.seo).toEqual({ value: 91, status: 'GREEN' });
			expect(desktop.performance).toEqual({ value: 73, status: 'AMBER' });
		});

		it('get_url_scan with includeDetails leaves object-keyed shape untouched', async () => {
			const { api } = mockApi(() => ({
				data: {
					page: 1,
					totalPages: 1,
					data: [
						{
							id: 'scan-1',
							mobile: {
								seo: { value: 91, status: 'GREEN' },
								performance: { value: 56, status: 'AMBER' },
							},
							desktop: { seo: { value: 91, status: 'GREEN' } },
						},
					],
				},
			}));
			const res = (await getUrlScanTool.handler(
				{
					projectId: PROJECT_ID,
					projectUrlId: 'u1',
					includeDetails: true,
					range: '30 days',
				},
				{ api } as never
			)) as { data: { data: Array<{ mobile: Record<string, unknown> }> } };
			expect(res.data.data[0].mobile.seo).toEqual({ value: 91, status: 'GREEN' });
		});
	});

	describe('#16 project description trim', () => {
		it('converts whitespace-only description to null', async () => {
			const { api } = mockApi(() => ({
				data: { id: PROJECT_ID, name: 'Telsen', description: '   ' },
			}));
			const res = (await getProjectTool.handler(
				{ projectId: PROJECT_ID },
				{ api } as never
			)) as { data: { description: string | null } };
			expect(res.data.description).toBeNull();
		});

		it('preserves a real description (just trims leading/trailing whitespace)', async () => {
			const { api } = mockApi(() => ({
				data: { id: PROJECT_ID, name: 'Pulse', description: '  Real description  ' },
			}));
			const res = (await getProjectTool.handler(
				{ projectId: PROJECT_ID },
				{ api } as never
			)) as { data: { description: string | null } };
			expect(res.data.description).toBe('Real description');
		});
	});

	describe('#30 member_rca prefixes bare-numeric rcaId', () => {
		it('rcaId of "10528" becomes "jira_rca_10528"', async () => {
			const { api } = mockApi(() => ({
				data: { items: [{ rcaId: '10528', sprintId: 'jira_sprint_7948' }] },
			}));
			const res = (await getMemberRcaTool.handler(
				{
					userId: '00000000-0000-0000-0000-000000000001',
					variant: 'details',
					projectIds: [PROJECT_ID],
					range: '30 days',
				},
				{ api } as never
			)) as { data: { items: Array<{ rcaId: string; sprintId: string }> } };
			expect(res.data.items[0].rcaId).toBe('jira_rca_10528');
			// Other prefixed IDs pass through unchanged.
			expect(res.data.items[0].sprintId).toBe('jira_sprint_7948');
		});

		it('already-prefixed rcaId passes through unchanged', async () => {
			const { api } = mockApi(() => ({
				data: { items: [{ rcaId: 'jira_rca_99' }] },
			}));
			const res = (await getMemberRcaTool.handler(
				{
					userId: '00000000-0000-0000-0000-000000000001',
					variant: 'details',
					projectIds: [PROJECT_ID],
					range: '30 days',
				},
				{ api } as never
			)) as { data: { items: Array<{ rcaId: string }> } };
			expect(res.data.items[0].rcaId).toBe('jira_rca_99');
		});
	});

	describe('#19 tech_audit drops empty tools field', () => {
		it('removes `tools: {}` from each repo entry', async () => {
			const { api } = mockApi(() => ({
				data: {
					repos: [
						{ name: 'a', readme: false, tools: {} },
						{ name: 'b', readme: true, tools: { ci: 'github-actions' } },
					],
				},
			}));
			const res = (await getTechAuditTool.handler(
				{ projectId: PROJECT_ID, ref: 'main', responseFormat: 'full' },
				{ api } as never
			)) as { data: { repos: Array<Record<string, unknown>> } };
			expect(res.data.repos[0]).not.toHaveProperty('tools');
			// Non-empty tools survives.
			expect(res.data.repos[1].tools).toEqual({ ci: 'github-actions' });
		});
	});
});
