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

/**
 * Type-erased handler for registry storage.
 *
 * Zod's generics are invariant, so `ToolDefinition<ZodObject<...>, unknown>` is NOT
 * assignable to `ToolDefinition<ZodTypeAny, unknown>`. We erase `args: any` at the
 * registry boundary to avoid the variance collision — individual handlers still get
 * fully-typed `args` because they're defined against the narrow `ToolDefinition<TInput>`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AnyToolDefinition {
	name: string;
	description: string;
	inputSchema: z.ZodTypeAny;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handler: (args: any, ctx: ToolContext) => Promise<unknown>;
}
