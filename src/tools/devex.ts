import { z } from 'zod';
import { ToolDefinition } from './types';
import { PulseApiClient } from '../api/client';

/**
 * DevEx (Developer Experience) survey endpoints.
 *
 * BE requires `range` for both survey + comments endpoints even though the OpenAPI
 * spec marks it optional. We default to "30 days" to keep the tool usable.
 *
 * Note: DevEx uses "4 months" as a range value (unlike other tools which use "1 year").
 */

const SURVEY_QUESTION_TYPES = [
	'overall_feedback',
	'focus_n_flow',
	'feedback_n_review_quality',
	'review_timelines',
	'ease_of_deployment',
	'codebase_maintainability',
	'clarity_of_requirements',
	'tooling_satisfaction',
	'project_planning',
	'testing_confidence',
	'quality_n_reliability',
	'overall_devex',
	'other_feedbacks',
] as const;

type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];

const RANGE_VALUES = ['7 days', '30 days', '4 months', '1 year'] as const;

const DevExSurveyInput = z.object({
	projectId: z.string().uuid(),
	surveyQuestionType: z
		.enum(SURVEY_QUESTION_TYPES)
		.describe('Which DevEx survey dimension to fetch.'),
	range: z.enum(RANGE_VALUES).default('30 days'),
	customRange: z
		.array(z.string())
		.optional()
		.describe('Optional custom date range, YYYY-MM-DD strings.'),
});

export const getDevExSurveyTool: ToolDefinition<typeof DevExSurveyInput> = {
	name: 'pulse_get_devex_survey',
	description: 'DevEx survey scores on a chosen dimension. (See instructions.ts.)',
	inputSchema: DevExSurveyInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/devex/${args.projectId}/survey/${args.surveyQuestionType}`,
			query: { range: args.range, customRange: args.customRange },
		}),
};

const DevExCommentsInput = z.object({
	projectId: z.string().uuid(),
	surveyQuestionType: z.enum(SURVEY_QUESTION_TYPES),
	range: z.enum(RANGE_VALUES).default('30 days'),
	customRange: z.array(z.string()).optional(),
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(100).default(20),
});

export const getDevExCommentsTool: ToolDefinition<typeof DevExCommentsInput> = {
	name: 'pulse_get_devex_comments',
	description: 'Free-text comments for a DevEx dimension. (See instructions.ts.)',
	inputSchema: DevExCommentsInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/devex/${args.projectId}/survey/${args.surveyQuestionType}/comments`,
			query: {
				range: args.range,
				customRange: args.customRange,
				page: args.page,
				limit: args.limit,
			},
		}),
};

/**
 * Fetches every DevEx question type for a project in parallel and returns them
 * keyed by type. Saves Claude from calling pulse_get_devex_survey 13 separate times
 * for a full project DevEx snapshot.
 */

const DevExSummaryInput = z.object({
	projectId: z.string().uuid(),
	range: z.enum(RANGE_VALUES).default('30 days'),
	customRange: z.array(z.string()).optional(),
	includeComments: z
		.boolean()
		.default(false)
		.describe(
			'If true, also fetch the comments (free-text) for each dimension in parallel. ' +
				'Much heavier response; only enable when the qualitative "why" is genuinely needed.'
		),
	commentsLimit: z
		.number()
		.int()
		.min(1)
		.max(100)
		.default(10)
		.describe('Comments per dimension when includeComments=true. Default 10.'),
});

interface SurveyDimension {
	type: SurveyQuestionType;
	score?: number;
	data?: unknown;
	error?: string;
	comments?: unknown;
	commentsError?: string;
}

async function fetchOne(
	api: PulseApiClient,
	projectId: string,
	type: SurveyQuestionType,
	range: (typeof RANGE_VALUES)[number],
	customRange?: string[]
): Promise<Pick<SurveyDimension, 'type' | 'data' | 'score' | 'error'>> {
	try {
		const res = (await api.request({
			method: 'GET',
			path: `/devex/${projectId}/survey/${type}`,
			query: { range, customRange },
		})) as { data?: { score?: number } };
		// Unwrap the envelope: API returns {statusCode, message, data: {...}}.
		// We return only the inner data so consumers don't end up with data.data.
		return { type, data: res?.data ?? res, score: res?.data?.score };
	} catch (err) {
		return { type, error: (err as Error).message?.slice(0, 180) ?? String(err) };
	}
}

async function fetchComments(
	api: PulseApiClient,
	projectId: string,
	type: SurveyQuestionType,
	range: (typeof RANGE_VALUES)[number],
	customRange: string[] | undefined,
	limit: number
): Promise<{ comments?: unknown; commentsError?: string }> {
	try {
		const res = (await api.request({
			method: 'GET',
			path: `/devex/${projectId}/survey/${type}/comments`,
			query: { range, customRange, page: 1, limit },
		})) as { data?: unknown };
		return { comments: res?.data ?? res };
	} catch (err) {
		return { commentsError: (err as Error).message?.slice(0, 180) ?? String(err) };
	}
}

export const getDevExSummaryTool: ToolDefinition<typeof DevExSummaryInput> = {
	name: 'pulse_get_devex_summary',
	description:
		'Full DevEx snapshot for a project: fetches all 13 survey dimensions in parallel ' +
		'and returns them keyed by dimension. Optional includeComments pulls qualitative ' +
		'feedback too. Prefer this over repeated pulse_get_devex_survey calls when the ' +
		"user asks 'how is the team feeling overall' or similar broad questions.",
	inputSchema: DevExSummaryInput,
	handler: async (args, ctx) => {
		const surveys = await Promise.all(
			SURVEY_QUESTION_TYPES.map((type) =>
				fetchOne(ctx.api, args.projectId, type, args.range, args.customRange)
			)
		);
		let commentsByType: Record<string, { comments?: unknown; commentsError?: string }> = {};
		if (args.includeComments) {
			const results = await Promise.all(
				SURVEY_QUESTION_TYPES.map((type) =>
					fetchComments(
						ctx.api,
						args.projectId,
						type,
						args.range,
						args.customRange,
						args.commentsLimit
					).then((r) => [type, r] as const)
				)
			);
			commentsByType = Object.fromEntries(results);
		}
		const dimensions: Record<string, SurveyDimension> = {};
		for (const s of surveys) {
			dimensions[s.type] = {
				...s,
				...(commentsByType[s.type] ?? {}),
			};
		}
		const scored = surveys.filter((s) => typeof s.score === 'number') as Array<{
			type: SurveyQuestionType;
			score: number;
		}>;
		const summary = {
			projectId: args.projectId,
			range: args.range,
			dimensionsFetched: SURVEY_QUESTION_TYPES.length,
			dimensionsWithScore: scored.length,
			averageScore:
				scored.length > 0
					? scored.reduce((sum, s) => sum + s.score, 0) / scored.length
					: null,
		};
		return { summary, dimensions };
	},
};
