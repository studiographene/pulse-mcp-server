#!/usr/bin/env node
/* eslint-disable no-console, import/no-unresolved, import/extensions */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema as zodToJsonSchemaRaw } from 'zod-to-json-schema';
import { loadConfig } from './config';
import { FileTokenStore } from './auth/file-token-store';
import { PasteTokenProvider } from './auth/paste-token-provider';
import { userIdFromToken } from './auth/jwt-claims';
import { PulseApiClient } from './api/client';
import { tools } from './tools';
import { ToolContext } from './tools/types';
import { PULSE_SERVER_INSTRUCTIONS, TOOL_DESCRIPTIONS } from './instructions';
import { buildTelemetry, TelemetryService } from './telemetry';
import { categoryFor } from './telemetry/tool-category';

const MCP_VERSION = '1.3.0';

// Type-erased wrapper — zod-to-json-schema's deep generic return type causes
// TS2589 when combined with MCP SDK's schema typing. Erase at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zodToJsonSchema = (schema: any): any => zodToJsonSchemaRaw(schema);

function warnOnMissingDescriptions(): void {
	for (const t of tools) {
		if (!TOOL_DESCRIPTIONS[t.name]) {
			console.error(
				`[pulse-mcp-server] warning: tool ${t.name} has no entry in TOOL_DESCRIPTIONS, using inline description`
			);
		}
	}
}

/**
 * Resolve the Pulse user UUID for telemetry correlation.
 *
 * Two paths:
 *   - Cookie/JWT tokens (legacy): decode the `sub` claim locally — instant, no I/O.
 *   - Opaque MCP tokens (`pulse_mcp_*`, post token-feature): no claims to decode;
 *     call `/users/me` to get the user. One extra request at startup.
 *
 * Both paths are best-effort. If userId can't be resolved, telemetry events
 * fire with an unknown user — non-blocking, never crashes the server.
 */
async function resolveUserId(
	tokenStore: FileTokenStore,
	apiClient: PulseApiClient
): Promise<string | undefined> {
	try {
		const token = await tokenStore.get();
		if (!token?.accessToken) return undefined;
		const fromJwt = userIdFromToken(token.accessToken);
		if (fromJwt) return fromJwt;
		// Opaque MCP token (or unknown shape) — fall back to /users/me.
		try {
			const me = (await apiClient.request({
				method: 'GET',
				path: '/users/me',
			})) as { data?: { id?: string }; id?: string };
			return me?.data?.id ?? me?.id ?? undefined;
		} catch {
			return undefined;
		}
	} catch {
		return undefined;
	}
}

function registerHandlers(
	server: Server,
	ctx: ToolContext,
	telemetry: TelemetryService
): void {
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const toolList: any[] = tools.map((t) => ({
			name: t.name,
			description: TOOL_DESCRIPTIONS[t.name] ?? t.description,
			inputSchema: zodToJsonSchema(t.inputSchema),
			// Annotations let the MCP client group tools by readOnlyHint
			// (e.g. Claude Desktop's "Read-only tools (N)" batch-permission
			// dropdown). Omitted entirely if the tool didn't declare any.
			...(t.annotations ? { annotations: t.annotations } : {}),
		}));
		return { tools: toolList };
	});

	server.setRequestHandler(CallToolRequestSchema, async (req) => {
		const tool = tools.find((t) => t.name === req.params.name);
		if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
		const args = tool.inputSchema.parse(req.params.arguments ?? {});
		const started = Date.now();
		try {
			const result = await tool.handler(args, ctx);
			telemetry.record('pulse_mcp.tool_called', {
				toolName: tool.name,
				category: categoryFor(tool.name),
				durationMs: Date.now() - started,
				outcome: 'success',
			});
			return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
		} catch (err) {
			telemetry.record('pulse_mcp.tool_called', {
				toolName: tool.name,
				category: categoryFor(tool.name),
				durationMs: Date.now() - started,
				outcome: 'error',
				errorClass: (err as Error).constructor?.name ?? 'Error',
			});
			throw err;
		}
	});
}

/**
 * Entry point for the Pulse MCP server (v1: local stdio transport).
 *
 * Wires together FileTokenStore + PasteTokenProvider + PulseApiClient and the
 * telemetry pipeline. For v2, swap those for multi-tenant implementations and
 * swap stdio for HTTP/SSE — tool code stays unchanged.
 */
async function main(): Promise<void> {
	const config = loadConfig();
	const tokenStore = new FileTokenStore(config.tokenFilePath);
	const apiClient = new PulseApiClient({
		baseUrl: config.pulseApiBaseUrl,
		auth: new PasteTokenProvider(tokenStore),
		tokenStore,
		timeoutMs: config.requestTimeoutMs,
	});
	const ctx: ToolContext = { api: apiClient };

	const telemetry = buildTelemetry({ mcpVersion: MCP_VERSION });
	const userId = await resolveUserId(tokenStore, apiClient);
	if (userId) telemetry.setUserId(userId);

	const server = new Server(
		{ name: 'pulse-mcp-server', version: MCP_VERSION },
		{ capabilities: { tools: {} }, instructions: PULSE_SERVER_INSTRUCTIONS }
	);

	warnOnMissingDescriptions();
	registerHandlers(server, ctx, telemetry);

	const shutdown = (): void => {
		telemetry.shutdown().finally(() => process.exit(0));
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	await server.connect(new StdioServerTransport());
}

main().catch((err) => {
	console.error('[pulse-mcp-server] fatal:', err);
	process.exit(1);
});
