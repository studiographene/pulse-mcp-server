import { AnyToolDefinition, ToolAnnotations } from './types';
import { listProjectsTool, getProjectTool, listProjectMembersTool } from './projects';
import { whoamiTool, listUsersTool, findUserTool } from './users';
import { getDevProcessMetricTool } from './dev-process';
import { getQaMetricTool, getQaRcaTool } from './qa';
import {
	getPmMetricTool,
	getEstimatesVsActualsTool,
	getWorkBreakdownTool,
} from './pm';
import {
	getProductSecurityTool,
	getTestCoverageTool,
	getVersionUpgradesTool,
	listProjectUrlsTool,
	getUrlScanTool,
} from './technical';
import { getCycleTimeTool } from './cycle-time';
import {
	getDevExSurveyTool,
	getDevExCommentsTool,
	getDevExSummaryTool,
	getDevExResponseRatesTool,
} from './devex';
import {
	getActivityOverviewTool,
	listOrgMembersTool,
	getMemberProfileTool,
	getMemberMetricTool,
	getMemberRcaTool,
} from './activity';
import { getTechAuditTool } from './tech-audit';
import { listProjectSprintsTool, listProjectReleasesTool } from './jira';
import { proposeMemberChangesTool, applyMemberChangesTool } from './project-members-update';

/**
 * Annotations applied to every tool that doesn't override them. Pulse MCP is
 * read-mostly: every tool except `pulse_apply_project_member_changes` returns
 * data without modifying state. Declaring `readOnlyHint: true` lets MCP
 * clients (e.g. Claude Desktop) group these tools as "Read-only" with a
 * single batch-permission toggle — users can opt into "always allow" for
 * the whole safe surface in one click.
 */
const READ_ONLY: ToolAnnotations = { readOnlyHint: true };

/**
 * Wrapping helper. Returns the tool with `annotations` set, defaulting to
 * READ_ONLY unless the tool already provides its own.
 */
function annotate<T extends AnyToolDefinition>(
	tool: T,
	annotations: ToolAnnotations = READ_ONLY
): T {
	return { ...tool, annotations };
}

/**
 * Registry of all MCP tools exposed by this server.
 *
 * Order is for human scan convenience only — MCP clients get them as a set.
 * Every tool except `applyMemberChangesTool` is read-only; that one tool
 * carries explicit destructive annotations so the client can flag it.
 */
export const tools: AnyToolDefinition[] = [
	// Core: projects + users
	annotate(listProjectsTool),
	annotate(getProjectTool),
	annotate(listProjectMembersTool),
	annotate(whoamiTool),
	annotate(listUsersTool),
	annotate(findUserTool),

	// Metrics: dev-process, qa, pm, technical, cycle-time
	annotate(getDevProcessMetricTool),
	annotate(getQaMetricTool),
	annotate(getQaRcaTool),
	annotate(getPmMetricTool),
	annotate(getEstimatesVsActualsTool),
	annotate(getWorkBreakdownTool),
	annotate(getProductSecurityTool),
	annotate(getTestCoverageTool),
	annotate(getVersionUpgradesTool),
	annotate(listProjectUrlsTool),
	annotate(getUrlScanTool),
	annotate(getCycleTimeTool),

	// Other domains
	annotate(getDevExSurveyTool),
	annotate(getDevExCommentsTool),
	annotate(getDevExSummaryTool),
	annotate(getDevExResponseRatesTool),
	annotate(getActivityOverviewTool),
	annotate(listOrgMembersTool),
	annotate(getMemberProfileTool),
	annotate(getMemberMetricTool),
	annotate(getMemberRcaTool),
	annotate(getTechAuditTool),

	// Jira integration — list sprints + releases (call these before QA/PM metrics that need filters)
	annotate(listProjectSprintsTool),
	annotate(listProjectReleasesTool),

	// Write tools (propose/apply safety pattern).
	// propose is read-only (returns a diff, no state change); apply is destructive
	// but idempotent (calling twice with the same input is a no-op on the second
	// call because the diff is already empty).
	annotate(proposeMemberChangesTool),
	annotate(applyMemberChangesTool, {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
	}),
];
