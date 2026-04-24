import axios from 'axios';
import { TelemetryEvent, TelemetrySink } from './types';

/**
 * Amplitude HTTP V2 sink. Plain `fetch`-style POST — no SDK, no state.
 *
 * API reference: https://amplitude.com/docs/apis/analytics/http-v2
 * Write keys are not secret (they identify a project, not a user), so we bake
 * them into the package for zero-config. If Pulse infra ever needs a secret
 * write key, thread via an env var.
 */

const AMPLITUDE_ENDPOINT = 'https://api2.amplitude.com/2/httpapi';

export class AmplitudeSink implements TelemetrySink {
	public constructor(
		private readonly apiKey: string,
		private readonly timeoutMs = 3_000
	) {}

	public async send(events: TelemetryEvent[]): Promise<void> {
		if (events.length === 0) return;
		await axios.post(
			AMPLITUDE_ENDPOINT,
			{
				api_key: this.apiKey,
				events: events.map((e) => ({
					user_id: e.userId ?? 'unknown',
					event_type: e.eventType,
					event_properties: {
						source: e.properties.source,
						tool_name: e.properties.toolName,
						category: e.properties.category,
						duration_ms: e.properties.durationMs,
						outcome: e.properties.outcome,
						error_class: e.properties.errorClass,
						mcp_version: e.properties.mcpVersion,
						platform: e.properties.platform,
						node_version: e.properties.nodeVersion,
					},
					time: e.time ?? Date.now(),
				})),
			},
			{ timeout: this.timeoutMs }
		);
	}
}
