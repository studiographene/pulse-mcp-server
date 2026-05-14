import { getDevExSurveyTool, getDevExCommentsTool, getDevExSummaryTool } from '../src/tools/devex';
import type { PulseApiClient } from '../src/api/client';

/**
 * Regression cover for the DevEx range-enum drift bug:
 *
 * The Pulse DevEx API expects English-phrase values ("last 1 month", "last
 * 3 months", "last 1 year"). The wrapper exposes compact-form values
 * ("30 days", "4 months", "1 year") consistent with the rest of the Pulse
 * MCP toolset, and must translate before sending. The tests below capture
 * the actual query payload sent to the API and assert the translation +
 * the customRange-overrides-range behaviour.
 */

interface CapturedRequest {
	method?: string;
	path?: string;
	query?: Record<string, unknown>;
}

function makeMockApi(): { api: PulseApiClient; captured: CapturedRequest[] } {
	const captured: CapturedRequest[] = [];
	const api = {
		request: async (opts: CapturedRequest): Promise<unknown> => {
			captured.push(opts);
			// Return a minimal envelope so summary's score arithmetic doesn't blow up.
			return { data: { score: 4.2 } };
		},
	} as unknown as PulseApiClient;
	return { api, captured };
}

const PROJECT_ID = '57db30ad-e3ba-4eae-8b1b-5e427c6cae33';

describe('DevEx range mapping', () => {
	describe('pulse_get_devex_survey', () => {
		it('translates "30 days" to "last 1 month"', async () => {
			const { api, captured } = makeMockApi();
			await getDevExSurveyTool.handler(
				{
					projectId: PROJECT_ID,
					surveyQuestionType: 'overall_devex',
					range: '30 days',
				},
				{ api } as never
			);
			expect(captured[0].query).toEqual({ range: 'last 1 month' });
		});

		it('translates "4 months" to "last 3 months"', async () => {
			const { api, captured } = makeMockApi();
			await getDevExSurveyTool.handler(
				{
					projectId: PROJECT_ID,
					surveyQuestionType: 'overall_devex',
					range: '4 months',
				},
				{ api } as never
			);
			expect(captured[0].query).toEqual({ range: 'last 3 months' });
		});

		it('translates "1 year" to "last 1 year"', async () => {
			const { api, captured } = makeMockApi();
			await getDevExSurveyTool.handler(
				{
					projectId: PROJECT_ID,
					surveyQuestionType: 'overall_devex',
					range: '1 year',
				},
				{ api } as never
			);
			expect(captured[0].query).toEqual({ range: 'last 1 year' });
		});

		it('omits range when customRange is supplied (API rejects both)', async () => {
			const { api, captured } = makeMockApi();
			await getDevExSurveyTool.handler(
				{
					projectId: PROJECT_ID,
					surveyQuestionType: 'overall_devex',
					range: '30 days',
					customRange: ['2026-02-14', '2026-05-14'],
				},
				{ api } as never
			);
			expect(captured[0].query).toEqual({
				customRange: ['2026-02-14', '2026-05-14'],
			});
			expect(captured[0].query).not.toHaveProperty('range');
		});
	});

	describe('pulse_get_devex_comments', () => {
		it('translates range + preserves page/limit', async () => {
			const { api, captured } = makeMockApi();
			await getDevExCommentsTool.handler(
				{
					projectId: PROJECT_ID,
					surveyQuestionType: 'focus_n_flow',
					range: '4 months',
					page: 2,
					limit: 50,
				},
				{ api } as never
			);
			expect(captured[0].query).toEqual({
				range: 'last 3 months',
				page: 2,
				limit: 50,
			});
		});

		it('omits range when customRange is supplied', async () => {
			const { api, captured } = makeMockApi();
			await getDevExCommentsTool.handler(
				{
					projectId: PROJECT_ID,
					surveyQuestionType: 'focus_n_flow',
					range: '30 days',
					customRange: ['2026-01-01', '2026-03-31'],
					page: 1,
					limit: 20,
				},
				{ api } as never
			);
			expect(captured[0].query).toEqual({
				customRange: ['2026-01-01', '2026-03-31'],
				page: 1,
				limit: 20,
			});
		});
	});

	describe('pulse_get_devex_summary', () => {
		it('forwards translated range to every dimension fetch', async () => {
			const { api, captured } = makeMockApi();
			await getDevExSummaryTool.handler(
				{
					projectId: PROJECT_ID,
					range: '1 year',
					includeComments: false,
					commentsLimit: 10,
				},
				{ api } as never
			);
			// One request per dimension (13) — every one carries the translated range.
			expect(captured.length).toBe(13);
			for (const req of captured) {
				expect(req.query).toEqual({ range: 'last 1 year' });
			}
		});

		it('omits range on every dimension when customRange is supplied', async () => {
			const { api, captured } = makeMockApi();
			await getDevExSummaryTool.handler(
				{
					projectId: PROJECT_ID,
					range: '30 days',
					customRange: ['2026-02-01', '2026-05-01'],
					includeComments: false,
					commentsLimit: 10,
				},
				{ api } as never
			);
			expect(captured.length).toBe(13);
			for (const req of captured) {
				expect(req.query).toEqual({
					customRange: ['2026-02-01', '2026-05-01'],
				});
				expect(req.query).not.toHaveProperty('range');
			}
		});
	});

	describe('input enum no longer exposes "7 days"', () => {
		// Zod validation lives on the *tool* definition's input schema. This
		// regression-tests that a caller still passing the old value gets a clear
		// validation error rather than a confusing 400 from the API.
		it('rejects "7 days" with a Zod validation error', () => {
			const result = getDevExSurveyTool.inputSchema.safeParse({
				projectId: PROJECT_ID,
				surveyQuestionType: 'overall_devex',
				range: '7 days',
			});
			expect(result.success).toBe(false);
		});
	});
});
