import { AnyToolDefinition } from './types';
import { listProjectsTool, getProjectTool, listProjectMembersTool } from './projects';
import { whoamiTool, listUsersTool, findUserTool } from './users';
import { getDevProcessMetricTool } from './dev-process';
import { getQaMetricTool, getQaRcaTool } from './qa';
import {
	getPmMetricTool,
	getEstimatesVsActualsTool,
	getTimeSpentTool,
	getWorkBreakdownTool,
} from './pm';
import {
	getProductSecurityTool,
	getTestCoverageTool,
	getVersionUpgradesTool,
	listProjectUrlsTool,
	getUrlScanTool,
	getPageSpeedScanTool,
} from './technical';
import { getCycleTimeTool } from './cycle-time';
import { getDevExSurveyTool, getDevExCommentsTool } from './devex';
import {
	getActivityOverviewTool,
	listOrgMembersTool,
	getMemberProfileTool,
} from './activity';
import { listFeedbackTool, getFeedbackTool } from './feedback';
import { getTechAuditTool } from './tech-audit';
import { listProjectSprintsTool, listProjectReleasesTool } from './jira';
import { proposeMemberChangesTool, applyMemberChangesTool } from './project-members-update';

/**
 * Registry of all MCP tools exposed by this server.
 *
 * Order is for human scan convenience only — MCP clients get them as a set.
 */
export const tools: AnyToolDefinition[] = [
	// Core: projects + users
	listProjectsTool,
	getProjectTool,
	listProjectMembersTool,
	whoamiTool,
	listUsersTool,
	findUserTool,

	// Metrics: dev-process, qa, pm, technical, cycle-time
	getDevProcessMetricTool,
	getQaMetricTool,
	getQaRcaTool,
	getPmMetricTool,
	getEstimatesVsActualsTool,
	getTimeSpentTool,
	getWorkBreakdownTool,
	getProductSecurityTool,
	getTestCoverageTool,
	getVersionUpgradesTool,
	listProjectUrlsTool,
	getUrlScanTool,
	getPageSpeedScanTool,
	getCycleTimeTool,

	// Other domains
	getDevExSurveyTool,
	getDevExCommentsTool,
	getActivityOverviewTool,
	listOrgMembersTool,
	getMemberProfileTool,
	listFeedbackTool,
	getFeedbackTool,
	getTechAuditTool,

	// Jira integration — list sprints + releases (call these before QA/PM metrics that need filters)
	listProjectSprintsTool,
	listProjectReleasesTool,

	// Write tools (propose/apply safety pattern)
	proposeMemberChangesTool,
	applyMemberChangesTool,
];
