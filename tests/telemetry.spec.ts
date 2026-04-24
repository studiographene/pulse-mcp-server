import { TelemetryService } from '../src/telemetry/service';
import { categoryFor } from '../src/telemetry/tool-category';
import type { TelemetryEvent, TelemetrySink } from '../src/telemetry/types';

class MockSink implements TelemetrySink {
	public sent: TelemetryEvent[][] = [];
	public shouldThrow = false;
	public async send(events: TelemetryEvent[]): Promise<void> {
		if (this.shouldThrow) throw new Error('boom');
		this.sent.push(events);
	}
}

describe('TelemetryService', () => {
	it('no-ops when sink is null', async () => {
		const svc = new TelemetryService({ sink: null, mcpVersion: '1.0.0' });
		svc.record('pulse_mcp.tool_called', { toolName: 'x', outcome: 'success' });
		await svc.flush();
		await svc.shutdown();
		// No throw = pass
	});

	it('records events with auto-injected properties', async () => {
		const sink = new MockSink();
		const svc = new TelemetryService({
			sink,
			mcpVersion: '1.2.3',
			userId: 'user-42',
			maxBatchSize: 1,
		});
		svc.record('pulse_mcp.tool_called', {
			toolName: 'pulse_whoami',
			category: 'users',
			outcome: 'success',
			durationMs: 150,
		});
		await svc.flush();
		await svc.shutdown();

		expect(sink.sent).toHaveLength(1);
		const ev = sink.sent[0]![0]!;
		expect(ev.userId).toBe('user-42');
		expect(ev.eventType).toBe('pulse_mcp.tool_called');
		expect(ev.properties.source).toBe('mcp');
		expect(ev.properties.mcpVersion).toBe('1.2.3');
		expect(ev.properties.platform).toBeTruthy();
		expect(ev.properties.nodeVersion).toBeTruthy();
		expect(ev.properties.toolName).toBe('pulse_whoami');
		expect(ev.properties.durationMs).toBe(150);
	});

	it('swallows sink errors silently', async () => {
		const sink = new MockSink();
		sink.shouldThrow = true;
		const svc = new TelemetryService({ sink, mcpVersion: '1.0.0' });
		svc.record('pulse_mcp.tool_called', { toolName: 'x', outcome: 'error' });
		await expect(svc.flush()).resolves.toBeUndefined();
		await svc.shutdown();
	});

	it('auto-flushes when queue hits maxBatchSize', async () => {
		const sink = new MockSink();
		const svc = new TelemetryService({ sink, mcpVersion: '1.0.0', maxBatchSize: 2 });
		svc.record('pulse_mcp.tool_called', { toolName: 'a' });
		svc.record('pulse_mcp.tool_called', { toolName: 'b' });
		// allow the microtask chain inside auto-flush to resolve
		await new Promise((r) => setImmediate(r));
		expect(sink.sent.length).toBeGreaterThanOrEqual(1);
		await svc.shutdown();
	});

	it('setUserId updates user on subsequent events only', async () => {
		const sink = new MockSink();
		const svc = new TelemetryService({ sink, mcpVersion: '1.0.0', maxBatchSize: 10 });
		svc.record('pulse_mcp.tool_called', { toolName: 'a' });
		svc.setUserId('user-99');
		svc.record('pulse_mcp.tool_called', { toolName: 'b' });
		await svc.flush();
		await svc.shutdown();
		const batch = sink.sent[0]!;
		expect(batch[0]!.userId).toBeUndefined();
		expect(batch[1]!.userId).toBe('user-99');
	});
});

describe('categoryFor', () => {
	it.each([
		['pulse_get_dev_process_metric', 'metrics.dev-process'],
		['pulse_get_qa_metric', 'metrics.qa'],
		['pulse_get_qa_rca', 'metrics.qa'],
		['pulse_get_pm_metric', 'metrics.pm'],
		['pulse_get_cycle_time', 'metrics.cycle-time'],
		['pulse_get_devex_survey', 'metrics.devex'],
		['pulse_get_devex_summary', 'metrics.devex'],
		['pulse_get_tech_audit', 'metrics.technical'],
		['pulse_get_test_coverage', 'metrics.technical'],
		['pulse_get_activity_overview', 'activity'],
		['pulse_list_project_sprints', 'jira'],
		['pulse_list_project_releases', 'jira'],
		['pulse_apply_project_member_changes', 'write'],
		['pulse_propose_project_member_changes', 'write'],
		['pulse_list_feedback', 'feedback'],
		['pulse_get_feedback', 'feedback'],
		['pulse_whoami', 'users'],
		['pulse_find_user', 'users'],
		['pulse_list_users', 'users'],
		['pulse_list_org_members', 'activity'],
		['pulse_get_member_profile', 'activity'],
		['pulse_list_projects', 'projects'],
		['pulse_get_project', 'projects'],
		['pulse_unknown_tool', 'other'],
	])('maps %s → %s', (tool, expected) => {
		expect(categoryFor(tool)).toBe(expected);
	});
});
