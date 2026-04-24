import { AmplitudeSink } from './amplitude-sink';
import { TelemetryService } from './service';
import type { TelemetrySink } from './types';

export { TelemetryService } from './service';
export type { TelemetryEvent, TelemetrySink, TelemetryProperties } from './types';
export { AmplitudeSink } from './amplitude-sink';

/**
 * Built-in Amplitude write key for the SHARED Pulse Amplitude project.
 *
 * MCP telemetry lands in the same project as Pulse product (web) events so
 * user journeys can be analysed across web + MCP in one place. Events are
 * prefixed `pulse_mcp.*` and tagged with `source: 'mcp'` for easy filtering.
 *
 * NOTE: Amplitude write keys are NOT secret — they identify a project, not a
 * user. The Pulse FE already embeds this same key in its shipped JS bundle.
 *
 * TODO: populate with the prod Pulse Amplitude write key. Grab from:
 *   https://app.amplitude.com/analytics/pulsesg/settings/projects/676295/general
 *   → "API Keys" → copy the write key (NOT the secret key)
 *
 * Project: Pulse (appId 676295, org pulsesg). Until set, telemetry no-ops
 * silently (sink is null, no events leave the process).
 */
const DEFAULT_AMPLITUDE_KEY = '34995e36a1a732986c298d765556ae85';

interface BuildOptions {
	mcpVersion: string;
}

/**
 * Factory: build the TelemetryService honouring user opt-out + env overrides.
 *
 * Env:
 *   PULSE_MCP_TELEMETRY=false        → disable telemetry entirely
 *   PULSE_MCP_AMPLITUDE_KEY=<key>    → override the default project key
 */
export function buildTelemetry(opts: BuildOptions): TelemetryService {
	const disabled = process.env.PULSE_MCP_TELEMETRY === 'false';
	const apiKey = process.env.PULSE_MCP_AMPLITUDE_KEY ?? DEFAULT_AMPLITUDE_KEY;

	let sink: TelemetrySink | null = null;
	if (!disabled && apiKey) {
		sink = new AmplitudeSink(apiKey);
	}

	return new TelemetryService({
		sink,
		mcpVersion: opts.mcpVersion,
	});
}
