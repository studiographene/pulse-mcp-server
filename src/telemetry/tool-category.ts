/**
 * Map a tool name to a coarse category. Used as an Amplitude property so we can
 * group tool usage by domain in dashboards without needing 31 separate filters.
 *
 * First prefix match wins; order matters (more-specific before less-specific).
 */

interface CategoryRule {
	matches: (name: string) => boolean;
	category: string;
}

const RULES: CategoryRule[] = [
	{ matches: (n) => n.startsWith('pulse_get_dev_process'), category: 'metrics.dev-process' },
	{ matches: (n) => n.startsWith('pulse_get_qa'), category: 'metrics.qa' },
	{
		matches: (n) =>
			n.startsWith('pulse_get_pm') ||
			n === 'pulse_get_estimates_vs_actuals' ||
			n === 'pulse_get_work_breakdown',
		category: 'metrics.pm',
	},
	{ matches: (n) => n.startsWith('pulse_get_cycle_time'), category: 'metrics.cycle-time' },
	{ matches: (n) => n.startsWith('pulse_get_devex'), category: 'metrics.devex' },
	{
		matches: (n) =>
			n === 'pulse_get_product_security' ||
			n === 'pulse_get_test_coverage' ||
			n === 'pulse_get_version_upgrades' ||
			n === 'pulse_get_url_scan' ||
			n === 'pulse_list_project_urls' ||
			n === 'pulse_get_tech_audit',
		category: 'metrics.technical',
	},
	{
		matches: (n) =>
			n.startsWith('pulse_get_activity') ||
			n === 'pulse_list_org_members' ||
			n.startsWith('pulse_get_member'),
		category: 'activity',
	},
	{
		matches: (n) => n === 'pulse_list_project_sprints' || n === 'pulse_list_project_releases',
		category: 'jira',
	},
	{ matches: (n) => n.includes('project_member_changes'), category: 'write' },
	{ matches: (n) => n.includes('_user') || n === 'pulse_whoami', category: 'users' },
	{ matches: (n) => n.includes('_project'), category: 'projects' },
];

export function categoryFor(toolName: string): string {
	const match = RULES.find((rule) => rule.matches(toolName));
	return match?.category ?? 'other';
}
