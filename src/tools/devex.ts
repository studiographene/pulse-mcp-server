import { z } from 'zod';
import { ToolDefinition } from './types';

const DevExSurveyInput = z.object({
	projectId: z.string().uuid(),
	surveyQuestionType: z
		.enum([
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
		])
		.describe('Which DevEx survey dimension to fetch.'),
});

export const getDevExSurveyTool: ToolDefinition<typeof DevExSurveyInput> = {
	name: 'pulse_get_devex_survey',
	description:
		'Fetch DevEx (Developer Experience) survey results for a project on a specific ' +
		'dimension — e.g. overall_devex, focus_n_flow, tooling_satisfaction, review_timelines. ' +
		'Use for "how is the team feeling about tooling / reviews / deployment on X?" questions.',
	inputSchema: DevExSurveyInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/devex/${args.projectId}/survey/${args.surveyQuestionType}`,
		}),
};

const DevExCommentsInput = z.object({
	projectId: z.string().uuid(),
	surveyQuestionType: z.string(),
});

export const getDevExCommentsTool: ToolDefinition<typeof DevExCommentsInput> = {
	name: 'pulse_get_devex_comments',
	description:
		'Fetch free-text comments submitted against a DevEx survey dimension. Pair with ' +
		'pulse_get_devex_survey to see the scores + the qualitative feedback together.',
	inputSchema: DevExCommentsInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/devex/${args.projectId}/survey/${args.surveyQuestionType}/comments`,
		}),
};
