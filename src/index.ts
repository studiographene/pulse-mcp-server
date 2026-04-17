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
import { PulseApiClient } from './api/client';
import { tools } from './tools';
import { ToolContext } from './tools/types';

// Type-erased wrapper — zod-to-json-schema's deep generic return type causes
// TS2589 when combined with MCP SDK's schema typing. Erase at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zodToJsonSchema = (schema: any): any => zodToJsonSchemaRaw(schema);

/**
 * Entry point for the Pulse MCP server (v1: local stdio transport).
 *
 * Wires together the concrete v1 implementations:
 *   - FileTokenStore (local file at ~/.pulse-mcp/token.json)
 *   - PasteTokenProvider (reads pasted Pulse access token)
 *   - PulseApiClient (axios wrapper with 419 rotation + 401 refresh)
 *
 * For v2, swap FileTokenStore + PasteTokenProvider for multi-tenant impls,
 * and swap StdioServerTransport for an HTTP/SSE transport. Tool code unchanged.
 */
async function main(): Promise<void> {
	const config = loadConfig();
	const tokenStore = new FileTokenStore(config.tokenFilePath);
	const authProvider = new PasteTokenProvider(tokenStore);
	const apiClient = new PulseApiClient({
		baseUrl: config.pulseApiBaseUrl,
		auth: authProvider,
		tokenStore,
		timeoutMs: config.requestTimeoutMs,
	});

	const ctx: ToolContext = { api: apiClient };

	const server = new Server(
		{ name: 'pulse-mcp-server', version: '0.1.0' },
		{ capabilities: { tools: {} } }
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const toolList: any[] = tools.map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: zodToJsonSchema(t.inputSchema),
		}));
		return { tools: toolList };
	});

	server.setRequestHandler(CallToolRequestSchema, async (req) => {
		const tool = tools.find((t) => t.name === req.params.name);
		if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
		const args = tool.inputSchema.parse(req.params.arguments ?? {});
		const result = await tool.handler(args, ctx);
		return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	console.error('[pulse-mcp-server] fatal:', err);
	process.exit(1);
});
