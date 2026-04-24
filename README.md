# pulse-mcp-server

MCP server for the Pulse API — lets you query Pulse project data, metrics, feedback, and (optionally) update project team members directly from Claude and other MCP-compatible AI tools.

> **Status**: v1 — local-only, single-user. See [roadmap](#roadmap) for the hosted/shared v2.

## What it does

Exposes the Pulse API as a set of MCP tools. When connected to Claude Desktop, Claude Code, or Claude Cowork, you can ask things like:

- "Show me cycle time for the Pulse project over the last 30 days"
- "What's the PR wait time trend on Drive Fuze?"
- "List feedback for the Pulse project"
- "Who's on the Pulse team?"
- "Remove Mavia from the Pulse team" (with confirmation)

## Requirements

- Node.js 18+
- pnpm 8+
- A Pulse account (access to [pulse.studiographene.com](https://pulse.studiographene.com))

## Install

```bash
git clone git@github.com:studiographene/pulse-mcp-server.git
cd pulse-mcp-server
pnpm install
pnpm build
```

## Configuration

### 1. Get your Pulse access token

1. Log into https://pulse.studiographene.com in your browser
2. Open DevTools → Application → Cookies → `https://pulse.studiographene.com`
3. Copy the value of the `token` cookie

### 2. Save it locally

Create `~/.pulse-mcp/token.json`:

```json
{
  "accessToken": "paste-your-token-here"
}
```

The file is created with `0600` permissions on first write. Don't commit this file anywhere.

Tokens last around 14 days and auto-rotate on re-issue. When rotation fails (token fully expired), grab a fresh one and update the file.

### 3. Register with Claude

#### Claude Desktop / Cowork

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "pulse": {
      "command": "node",
      "args": ["/absolute/path/to/pulse-mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The Pulse tools will appear in the tools menu.

#### Claude Code

```bash
claude mcp add pulse node /absolute/path/to/pulse-mcp-server/dist/index.js
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PULSE_API_BASE_URL` | `https://prod.apis.pulse.studiographene.com` | Pulse API host |
| `PULSE_MCP_TOKEN_PATH` | `~/.pulse-mcp/token.json` | Where the access token lives |
| `PULSE_API_TIMEOUT_MS` | `60000` | Per-request timeout (metric endpoints can take 3–30s) |
| `PULSE_MCP_TELEMETRY` | `true` (on) | Set to `false` to disable anonymous tool-usage telemetry |
| `PULSE_MCP_AMPLITUDE_KEY` | built-in project key | Override the Amplitude write key (rarely needed) |

## Telemetry

The MCP sends anonymous usage events to Amplitude so the team can see which tools
are actually useful. Events are tool-level only — **no tool arguments, response
content, or user queries are ever sent**. Specifically:

**Sent per tool call:** tool name, category, duration, success/error outcome,
error class (not message), MCP version, platform, node version, Pulse user UUID
(same id used by Pulse product Amplitude, so events correlate).

**Never sent:** tool arguments, project names, sprint ids, user-authored queries,
API responses.

Events are batched (every 30 seconds or 50 events) and fire-and-forget — if
Amplitude is unreachable, your tool calls still work and events are dropped
silently. To disable telemetry entirely, set `PULSE_MCP_TELEMETRY=false` in your
Claude Desktop config's `env` block.

## Development

```bash
pnpm dev            # run with ts-node (watches via tsc if you want: tsc --watch)
pnpm lint           # eslint
pnpm test           # jest
pnpm build          # emit dist/
```

Commits follow Conventional Commits (e.g. `feat(tools): add pulse_list_projects`). Scope is required. Branches must be `feature/PX-NNNN`, `fix/PX-NNNN`, etc.

## Tools

See `src/tools/` for the full registered set. v1 scope:

- **Projects**: list, get, list members
- **Users**: find, list, whoami
- **Metrics**: dev-process, QA, PM, technical (TSC), cycle time
- **DevEx**: survey data
- **Activity**: org-level cross-project metrics
- **Feedback**: list, get
- **Tech Audit**: get
- **Write**: update project members (propose/apply pattern with diff preview)

## Roadmap

- **v1 (current)**: local stdio, single user, paste-token auth
- **v2**: hosted remote MCP with per-user Google OAuth, shareable across the team

The v2 migration doesn't require rewrites — `TokenStore` and `AuthProvider` are interfaces, swapped at the composition root.

## Security

- Access token stored locally with 0600 permissions, never transmitted except to the Pulse API
- All calls use your Pulse account — actions are audited as you
- No BE changes required; reuses existing `POST /login` flow
- Semgrep SAST, licence scanning, and daily dependency vulnerability scans via reusable CI

## License

Private — Studio Graphene internal use only.
