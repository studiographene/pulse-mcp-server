# Installing Pulse MCP Server

One-time setup per machine, ~5 minutes. Works with Claude Cowork, Claude Desktop, and Claude Code.

> The install flow is written for **both** package distribution options. Follow the relevant variant once we confirm private vs public. Steps 1 and 2 only apply to the private variant.

## Prerequisites

- **Node.js 18 or newer** — check with `node --version`. Install via [nodejs.org](https://nodejs.org) or `brew install node` on macOS.
- A **Pulse account** — you need to be able to log into https://pulse.studiographene.com.

---

## Variant A — Private GitHub Packages (plan of record)

### Step 1: Create a GitHub personal access token

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. **Token name**: `pulse-mcp-read` (or anything memorable)
3. **Resource owner**: `studiographene`
4. **Expiration**: 1 year (you'll need to regenerate when it expires)
5. **Repository access**: *Public repositories only* — the package is what's gated, the repo scope is just boilerplate
6. **Permissions → Account permissions → Packages**: set to **Read-only**
7. Click **Generate token** and copy the value (starts with `github_pat_...`)

### Step 2: Configure npm to read from GitHub Packages

Add these two lines to `~/.npmrc` (create the file if it doesn't exist):

```ini
@studiographene:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=github_pat_YOUR_TOKEN_HERE
```

Replace `github_pat_YOUR_TOKEN_HERE` with the token from Step 1.

This tells npm: "for anything in the `@studiographene` scope, authenticate against GitHub Packages with this token". One-time setup; covers any future SG packages too.

### Step 3: Get your Pulse access token

1. Log into https://pulse.studiographene.com
2. Open browser DevTools → **Application → Cookies → `https://pulse.studiographene.com`**
3. Copy the value of the `token` cookie

### Step 4: Save the Pulse token locally

Create `~/.pulse-mcp/token.json`:

```json
{ "accessToken": "paste-your-pulse-token-here" }
```

Then lock down permissions:

```bash
chmod 600 ~/.pulse-mcp/token.json
```

Pulse tokens last ~14 days and auto-rotate on re-issue. If a tool call returns `Pulse auth failed (401)`, grab a fresh cookie value and overwrite the file.

### Step 5: Register the MCP with your Claude client

#### Claude Cowork / Claude Desktop

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

#### Claude Code

```bash
claude mcp add pulse npx -y @studiographene/pulse-mcp
```

### Step 6: Verify

In Claude, ask: *"Who am I on Pulse?"*

It should pick the `pulse_whoami` tool, ask for approval the first time, and return your Pulse profile. ~30 seconds later, a `pulse_mcp.tool_called` event lands in Amplitude.

---

## Variant B — Public npm (if we go public)

If the package is published publicly, Steps 1 and 2 disappear entirely. You just need the Pulse token and the Claude config.

### Step 1: Get your Pulse access token

(Same as Variant A Step 3.)

### Step 2: Save the Pulse token locally

(Same as Variant A Step 4.)

### Step 3: Register the MCP with your Claude client

(Same as Variant A Step 5 — the `npx` line works identically because public npm needs no auth.)

### Step 4: Verify

(Same as Variant A Step 6.)

---

## Optional: disable telemetry

The MCP sends anonymous tool-usage events to Amplitude (no tool arguments, no response content, no user queries). To opt out, add an `env` block to your Claude config:

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

See [README.md § Telemetry](./README.md#telemetry) for the full allowlist of what's sent.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm ERR! 401 Unauthorized` on install | PAT missing, expired, or wrong scope | Regenerate with `read:packages`, update `~/.npmrc` |
| `Pulse auth failed (401)` at tool call | Pulse cookie expired (14-day rotation) | Grab fresh cookie, overwrite `~/.pulse-mcp/token.json` |
| Pulse tools don't appear in the tools menu | Client wasn't restarted after config change | Quit and relaunch Claude Cowork / Desktop |
| `command not found: npx` | Node not installed or not on PATH | `brew install node` (macOS); reopen terminal |
| `ENOENT: no such file or directory, open '~/.pulse-mcp/token.json'` | File doesn't exist yet | Create it with the JSON from Step 4 |

If you're stuck, ping **#pulse-mcp** on Slack with the error message.

---

## Updating

When a new version is released, `npx -y @studiographene/pulse-mcp` fetches the latest on next restart automatically. To pin a specific version, change the `args` in your Claude config:

```json
"args": ["-y", "@studiographene/pulse-mcp@1.2.0"]
```
