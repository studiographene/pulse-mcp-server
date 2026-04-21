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
	description: 'DevEx survey scores on a chosen dimension. (See instructions.ts.)',
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
	description: 'Free-text comments for a DevEx dimension. (See instructions.ts.)',
	inputSchema: DevExCommentsInput,
	handler: async (args, ctx) =>
		ctx.api.request({
			method: 'GET',
			path: `/devex/${args.projectId}/survey/${args.surveyQuestionType}/comments`,
		}),
};
