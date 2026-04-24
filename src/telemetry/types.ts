/**
 * Telemetry contract.
 *
 * Events represent tool invocations and their outcomes. Designed to be privacy-
 * respecting: no tool arguments, no response bodies, no user-authored queries.
 * Only coarse properties that help us understand which tools are useful.
 */

export interface TelemetryProperties {
	/**
	 * Always 'mcp' for events emitted by this server. Makes it trivial to filter
	 * MCP events from product (web) events in the shared Pulse Amplitude project.
	 */
	source: 'mcp';
	toolName?: string;
	category?: string; // e.g. 'metrics', 'jira', 'write'
	durationMs?: number;
	outcome?: 'success' | 'error';
	/** Error constructor name or HTTP status family, NOT the error message */
	errorClass?: string;
	mcpVersion: string;
	platform: string; // darwin | linux | win32
	nodeVersion: string;
}

export interface TelemetryEvent {
	/** Stable Pulse user UUID. Resolved from the API key's JWT claims. */
	userId?: string;
	/** Event category. Always prefixed with `pulse_mcp.` */
	eventType: 'pulse_mcp.tool_called' | 'pulse_mcp.session_started';
	/** Non-sensitive properties only. See TelemetryProperties. */
	properties: TelemetryProperties;
	/** Unix epoch millis. Defaults to now() if omitted. */
	time?: number;
}

/**
 * Abstract sink. File-based impl is useful for local dev; Amplitude impl ships
 * by default in production. Callers use this via TelemetryService.record().
 */
export interface TelemetrySink {
	send(events: TelemetryEvent[]): Promise<void>;
}
