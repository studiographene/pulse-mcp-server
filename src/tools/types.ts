import { z } from 'zod';
import { PulseApiClient } from '../api/client';

/**
 * Tool handler contract.
 *
 * Each MCP tool provides a Zod input schema (for type-safe args + MCP schema generation)
 * and a handler that receives the parsed args + shared context.
 *
 * Handlers are pure w.r.t. transport — they don't know if they're running over stdio
 * (v1) or HTTP (v2). All side-effects flow through `ctx.api`.
 */

export interface ToolContext {
	api: PulseApiClient;
	/** Pulse userId for multi-tenant setups (v2). Undefined in v1. */
	userId?: string;
}

export interface ToolDefinition<TInput extends z.ZodTypeAny, TOutput = unknown> {
	name: string;
	description: string;
	inputSchema: TInput;
	handler: (args: z.infer<TInput>, ctx: ToolContext) => Promise<TOutput>;
}

export type AnyToolDefinition = ToolDefinition<z.ZodTypeAny, unknown>;
