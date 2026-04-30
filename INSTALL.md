# Installing the Pulse MCP

One-time setup per machine, about 3 minutes. Works with Claude Cowork, Claude Desktop, and Claude Code.

## Prerequisites

- **Node.js 18 or newer** — check with `node --version`. Install via [nodejs.org](https://nodejs.org) or `brew install node` on macOS.
- A **Pulse account** — you need to be able to log into https://pulse.studiographene.com.

## Step 1: Get your Pulse MCP token

> Once the in-Pulse token UI ships you'll grab the token from **Settings → MCP Access** in the Pulse web app. Until then, the temporary fallback is:
>
> 1. Log into https://pulse.studiographene.com
> 2. Open browser DevTools → **Application → Cookies → `https://pulse.studiographene.com`**
> 3. Copy the value of the `token` cookie

## Step 2: Save the token locally

Create `~/.pulse-mcp/token.json`:

```json
{ "accessToken": "paste-your-pulse-token-here" }
```

Then lock down permissions:

```bash
chmod 600 ~/.pulse-mcp/token.json
```

## Step 3: Register the MCP with your Claude client

### Claude Cowork / Claude Desktop

Edit your config file (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pulse": {
      "command": "npx",
      "args": ["-y", "@studiographene/pulse-mcp"]
    }
  }
}
```

Restart Claude Cowork / Desktop.

### Claude Code

```bash
claude mcp add pulse npx -y @studiographene/pulse-mcp
```

## Step 4: Verify

In Claude, ask:

> *"Who am I on Pulse?"*

It should pick the `pulse_whoami` tool, ask for approval the first time, and return your Pulse profile.

---

## Optional: disable telemetry

The MCP sends anonymous tool-usage events to Amplitude (no tool arguments, no response content, no user queries — see [README § Telemetry](./README.md#telemetry) for the full allowlist). To opt out, add an `env` block to your Claude config:

```json
{
  "mcpServers": {
    "pulse": {
      "command": "npx",
      "args": ["-y", "@studiographene/pulse-mcp"],
      "env": {
        "PULSE_MCP_TELEMETRY": "false"
      }
    }
  }
}
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Pulse auth failed (401)` on a tool call | Pulse cookie / token expired (~14 day rotation on the cookie path) | Grab fresh token, overwrite `~/.pulse-mcp/token.json` |
| Pulse tools don't appear in the tools menu | Client wasn't restarted after config change | Quit (Cmd+Q on macOS) and relaunch Claude Cowork / Desktop |
| `command not found: npx` | Node not installed or not on PATH | `brew install node` (macOS); reopen terminal |
| `ENOENT: no such file or directory, open '~/.pulse-mcp/token.json'` | File doesn't exist yet | Create it with the JSON from Step 2 |

If you're stuck, ping **#pulse-mcp** on Slack with the error message.

## Updating

When a new version is released, `npx -y @studiographene/pulse-mcp` fetches the latest on next restart automatically. To pin a specific version, change the `args` in your Claude config:

```json
"args": ["-y", "@studiographene/pulse-mcp@1.3.0"]
```
