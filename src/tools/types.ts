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

/**
 * MCP tool annotations — hints the client uses to drive its permission UI.
 *
 * Claude Desktop groups tools by `readOnlyHint` in the connector settings
 * (e.g. "Read-only tools (29)" gets a single batch-permission dropdown), so
 * declaring this correctly lets users opt into "always allow" for the safe
 * read-only surface in one click instead of approving each tool individually.
 *
 * Spec: https://modelcontextprotocol.io/specification/2024-11-05/server/tools
 */
export interface ToolAnnotations {
	/** True if the tool does not modify state. */
	readOnlyHint?: boolean;
	/** True if the tool may destroy state (only meaningful when readOnlyHint is false). */
	destructiveHint?: boolean;
	/** True if calling the tool twice with the same args has the same effect as once. */
	idempotentHint?: boolean;
	/** True if the tool interacts with external systems beyond the local environment. */
	openWorldHint?: boolean;
}

export interface ToolDefinition<TInput extends z.ZodTypeAny, TOutput = unknown> {
	name: string;
	description: string;
	inputSchema: TInput;
	annotations?: ToolAnnotations;
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
	annotations?: ToolAnnotations;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handler: (args: any, ctx: ToolContext) => Promise<unknown>;
}
