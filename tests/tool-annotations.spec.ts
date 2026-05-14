/**
 * Regression cover for tool annotations.
 *
 * Claude Desktop and other MCP clients group tools by `readOnlyHint` (e.g.
 * "Read-only tools (29)") so users can opt into a batch "always allow"
 * permission decision instead of approving each tool individually. The
 * registry in src/tools/index.ts is the source of truth for these
 * annotations; this spec locks that down so a future tool addition that
 * forgets to call `annotate()` is caught by CI rather than at runtime by a
 * confused user.
 */

import { tools } from '../src/tools/index';

describe('Tool annotations', () => {
	it('every tool declares annotations', () => {
		const missing = tools.filter((t) => !t.annotations).map((t) => t.name);
		expect(missing).toEqual([]);
	});

	it('every tool except pulse_apply_project_member_changes is read-only', () => {
		const notReadOnly = tools
			.filter((t) => t.annotations?.readOnlyHint !== true)
			.map((t) => t.name);
		expect(notReadOnly).toEqual(['pulse_apply_project_member_changes']);
	});

	it('pulse_apply_project_member_changes is marked destructive + idempotent', () => {
		const apply = tools.find((t) => t.name === 'pulse_apply_project_member_changes');
		expect(apply).toBeDefined();
		expect(apply!.annotations).toEqual({
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
		});
	});
});
