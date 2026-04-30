# Installing the Pulse MCP

The Pulse MCP has been approved at the org level by your Cowork / Claude Desktop admin, so all you need to do is enable it for yourself and provide your Pulse token. About 3 minutes.

## Prerequisites

- **Node.js 18 or newer** — check with `node --version`. Install via [nodejs.org](https://nodejs.org) or `brew install node` on macOS.
- A **Pulse account** — you need to be able to log into https://pulse.studiographene.com.

## Step 1: Get your Pulse MCP token

> Once the in-Pulse token UI ships, you'll grab the token from **Settings → MCP Access** in the Pulse web app. Until then, the temporary fallback is:
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

## Step 3: Enable the MCP in your Claude client

### Claude Cowork / Claude Desktop

Open **Settings → Connectors**, find **Pulse MCP** in the approved list, and click **Enable**. If you don't see it, your config file lives at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) — add:

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

Then restart Claude Cowork / Desktop.

### Claude Code

```bash
claude mcp add pulse npx -y @studiographene/pulse-mcp
```

## Step 4: Verify

In Claude, ask:

> *"Who am I on Pulse?"*

It should pick the `pulse_whoami` tool, ask for approval the first time, and return your Pulse profile.
