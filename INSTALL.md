# Installing the Pulse MCP

The Pulse MCP has been approved at the org level by your Claude admin, so all you need to do is enable it for yourself and provide your Pulse token. Two minutes if you use the install script.

## The fast path (recommended)

### 1. Get your token

Open https://pulse.studiographene.com/profile, find the **MCP Access** section, and click **Copy**.

### 2. Run the install script

In Terminal, paste:

```bash
curl -sSL https://raw.githubusercontent.com/studiographene/pulse-mcp-server/master/install.sh | bash
```

The script will:
- Check that Node.js is installed (and offer to install it via Homebrew if not)
- Ask you to paste the token from step 1
- Save the token to `~/.pulse-mcp/token.json` with the right permissions
- Add the Pulse MCP entry to your Claude config (with a backup of the existing config)

### 3. Restart Claude

**Fully quit** Claude Cowork / Desktop (Cmd+Q on macOS — closing the window isn't enough), then re-open it.

### 4. Verify

Ask Claude:

> *"Who am I on Pulse?"*

It should pick the `pulse_whoami` tool, ask for approval the first time, and return your Pulse profile.

---

## Manual install (if you'd rather not run a script)

You'll need:
- **Node.js 20 or newer** ([download](https://nodejs.org), or `brew install node` on macOS)
- A **Pulse account** at [pulse.studiographene.com](https://pulse.studiographene.com)

### 1. Get your token

Same as above — copy from https://pulse.studiographene.com/profile → MCP Access.

### 2. Save the token

Create `~/.pulse-mcp/token.json`:

```json
{ "accessToken": "paste-your-pulse-token-here" }
```

Lock down permissions:

```bash
chmod 600 ~/.pulse-mcp/token.json
```

### 3. Enable the MCP in your Claude client

**Claude Cowork / Desktop** — open `Settings → Connectors`, find **Pulse MCP** in the approved list, and click **Enable**. If you don't see it in the list, edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) and add:

```json
{
  "mcpServers": {
    "pulse": {
      "command": "npx",
      "args": ["-y", "git+https://github.com/studiographene/pulse-mcp-server.git"]
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add pulse npx -y git+https://github.com/studiographene/pulse-mcp-server.git
```

> **Pinning a version**: append `#vX.Y.Z` to the git URL — e.g. `git+https://github.com/studiographene/pulse-mcp-server.git#v1.3.0`. Without a pin, `npx` clones the latest `master` on each invocation.

### 4. Restart and verify

(Same as the fast-path steps 3 + 4.)
