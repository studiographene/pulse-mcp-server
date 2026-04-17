import { AnyToolDefinition } from './types';

/**
 * Registry of all MCP tools exposed by this server.
 *
 * Populated in subsequent phases. Keep this list curated — don't dump every
 * Pulse endpoint; expose only what's genuinely useful for AI-assisted workflows.
 */
export const tools: AnyToolDefinition[] = [
	// Populated in phase 4 (read tools) + phase 5 (write tools)
];
