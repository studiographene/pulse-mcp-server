import { platform, version as nodeVersion } from 'process';
import { TelemetryEvent, TelemetrySink } from './types';

/**
 * Queues telemetry events in memory and flushes them to the sink in batches.
 * Fire-and-forget; failures are silent so telemetry never blocks a tool call.
 *
 * Usage:
 *   const tel = new TelemetryService({ sink, mcpVersion, flushIntervalMs });
 *   tel.record('pulse_mcp.tool_called', { toolName, durationMs, outcome });
 *   await tel.shutdown(); // call on process exit to flush pending
 */

interface TelemetryServiceOptions {
	sink: TelemetrySink | null; // null = disabled (opt-out path)
	mcpVersion: string;
	flushIntervalMs?: number;
	maxBatchSize?: number;
	userId?: string;
}

export class TelemetryService {
	private readonly queue: TelemetryEvent[] = [];
	private readonly sink: TelemetrySink | null;
	private readonly mcpVersion: string;
	private readonly flushIntervalMs: number;
	private readonly maxBatchSize: number;
	private timer: NodeJS.Timeout | null = null;
	private userId?: string;

	public constructor(opts: TelemetryServiceOptions) {
		this.sink = opts.sink;
		this.mcpVersion = opts.mcpVersion;
		this.flushIntervalMs = opts.flushIntervalMs ?? 30_000;
		this.maxBatchSize = opts.maxBatchSize ?? 50;
		this.userId = opts.userId;
		if (this.sink) this.startTimer();
	}

	public setUserId(userId: string): void {
		this.userId = userId;
	}

	public record(
		eventType: TelemetryEvent['eventType'],
		props: Omit<
			TelemetryEvent['properties'],
			'source' | 'mcpVersion' | 'platform' | 'nodeVersion'
		>
	): void {
		if (!this.sink) return;
		this.queue.push({
			userId: this.userId,
			eventType,
			properties: {
				...props,
				source: 'mcp',
				mcpVersion: this.mcpVersion,
				platform,
				nodeVersion,
			},
			time: Date.now(),
		});
		if (this.queue.length >= this.maxBatchSize) {
			this.flush().catch(() => undefined);
		}
	}

	public async flush(): Promise<void> {
		if (!this.sink || this.queue.length === 0) return;
		const batch = this.queue.splice(0, this.queue.length);
		try {
			await this.sink.send(batch);
		} catch {
			// Silent: telemetry failures MUST NOT surface to callers.
			// Dropped events are preferable to noisy tool responses.
		}
	}

	public async shutdown(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		await this.flush();
	}

	private startTimer(): void {
		this.timer = setInterval(() => {
			this.flush().catch(() => undefined);
		}, this.flushIntervalMs);
		// Don't keep the process alive solely for the telemetry timer.
		this.timer.unref?.();
	}
}
