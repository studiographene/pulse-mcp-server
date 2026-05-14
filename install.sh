#!/usr/bin/env bash
#
# Pulse MCP — one-line installer.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/studiographene/pulse-mcp-server/master/install.sh | bash
#
# What it does (safe to re-run):
#   1. Checks for Node.js >= 20; offers to install via Homebrew on macOS or
#      via the NodeSource setup script on Linux.
#   2. Prompts for your Pulse MCP token and writes it to
#      ~/.pulse-mcp/token.json with 0600 permissions.
#   3. Adds the Pulse MCP entry to your Claude Cowork / Desktop config
#      (~/Library/Application Support/Claude/claude_desktop_config.json on
#      macOS, equivalents on Linux/Windows). Backs up the existing config
#      before writing.
#   4. Tells you to restart Claude.
#
# This script does not need root. Homebrew install (if needed) may prompt
# for sudo — that's Homebrew's own flow, not us.

set -euo pipefail

# ---------- interactive prompt source ----------
# The documented install path is `curl … | bash`, where bash's stdin is the
# pipe carrying the script itself. We cannot `exec </dev/tty` globally because
# that would also replace the script-source FD bash is reading from, leaving
# bash to interpret subsequent keystrokes as new commands. Instead, each
# `read` call below uses an explicit `</dev/tty` redirect so only that prompt
# reads from the terminal, leaving the script stream intact.
if [ -r /dev/tty ]; then
	PROMPT_FD="/dev/tty"
else
	# Fallback: no tty (true non-interactive run, e.g. CI). Reads will pull
	# from the pipe and almost certainly get EOF; the empty-token check
	# fails fast with a clear message.
	PROMPT_FD="/dev/stdin"
fi

# ---------- presentation ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

step()   { printf "\n${BOLD}${BLUE}▸ %s${RESET}\n" "$1"; }
info()   { printf "  %s\n" "$1"; }
ok()     { printf "  ${GREEN}✓ %s${RESET}\n" "$1"; }
warn()   { printf "  ${YELLOW}⚠ %s${RESET}\n" "$1"; }
fail()   { printf "  ${RED}✗ %s${RESET}\n" "$1" >&2; exit 1; }

# ---------- platform detect ----------
OS="$(uname -s)"
case "$OS" in
	Darwin) PLATFORM=mac ;;
	Linux)  PLATFORM=linux ;;
	*)      fail "Unsupported OS: $OS. Run on macOS or Linux, or use the manual flow in INSTALL.md." ;;
esac

CONFIG_DIR_MAC="$HOME/Library/Application Support/Claude"
CONFIG_DIR_LINUX="$HOME/.config/Claude"
TOKEN_DIR="$HOME/.pulse-mcp"
TOKEN_FILE="$TOKEN_DIR/token.json"
# Install straight from the public GitHub repo rather than npm. Override
# INSTALL_REF with a tag (e.g. v1.3.0) to pin a specific version;
# defaults to master.
INSTALL_REF="${PULSE_MCP_INSTALL_REF:-master}"
PACKAGE_SOURCE="git+https://github.com/studiographene/pulse-mcp-server.git#${INSTALL_REF}"

# ---------- 1. Node ----------
step "Checking for Node.js"

NODE_OK=false
if command -v node >/dev/null 2>&1; then
	NODE_VERSION="$(node --version)"
	# Strip leading "v"
	NODE_MAJOR="${NODE_VERSION#v}"
	NODE_MAJOR="${NODE_MAJOR%%.*}"
	if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
		ok "Node.js $NODE_VERSION already installed"
		NODE_OK=true
	else
		warn "Node.js $NODE_VERSION is too old (need >= 20)"
	fi
else
	info "Node.js not found"
fi

if [ "$NODE_OK" = false ]; then
	if [ "$PLATFORM" = "mac" ]; then
		# If Homebrew isn't present, offer to install it via the official
		# installer. We don't silently install: the Homebrew installer requires
		# sudo and modifies the user's shell config, so they need to consent.
		# After install we source `brew shellenv` so the subsequent
		# `brew install node@22` line below finds it on PATH in the current
		# shell (Homebrew's installer otherwise only sets PATH for *new* shells).
		if ! command -v brew >/dev/null 2>&1; then
			info "Homebrew not found. Homebrew is the package manager we'll use to install Node.js."
			info "It requires your sudo password, and writes a small line to your shell config (~/.zprofile)."
			printf "  Install Homebrew now? ${BOLD}[y/N]${RESET} "
			read -r brew_answer <"$PROMPT_FD"
			case "$brew_answer" in
				y|Y|yes|YES)
					info "Running the official Homebrew installer from https://brew.sh"
					# Give the Homebrew installer an explicit TTY for stdin.
					# Same root cause as our own `curl | bash` fix earlier (PR
					# #27): when this script is itself invoked via curl|bash,
					# its stdin is the depleted curl pipe. The Homebrew
					# installer also tries to read from stdin (to confirm
					# install dirs and prompt for sudo), and it refuses to
					# prompt for sudo in "non-interactive" mode, which then
					# surfaces as "Need sudo access on macOS" even when the
					# user IS an admin. Forcing `< /dev/tty` (via PROMPT_FD)
					# gives Homebrew a real interactive terminal.
					/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" <"$PROMPT_FD"
					# Source brew into the current shell. Apple Silicon installs
					# to /opt/homebrew, Intel to /usr/local — try both.
					if [ -x /opt/homebrew/bin/brew ]; then
						eval "$(/opt/homebrew/bin/brew shellenv)"
					elif [ -x /usr/local/bin/brew ]; then
						eval "$(/usr/local/bin/brew shellenv)"
					fi
					if ! command -v brew >/dev/null 2>&1; then
						fail "Homebrew install appeared to complete but 'brew' is still not on PATH. Open a new Terminal window and re-run this installer."
					fi
					ok "Homebrew installed"
					;;
				*)
					fail "Aborted. Install Homebrew from https://brew.sh (or Node directly from https://nodejs.org) and re-run."
					;;
			esac
		fi
		printf "  Install Node.js 22 LTS via Homebrew? ${BOLD}[y/N]${RESET} "
		read -r answer <"$PROMPT_FD"
		case "$answer" in
			y|Y|yes|YES)
				info "Running: brew install node@22"
				brew install node@22
				brew link --overwrite node@22 || true
				ok "Node installed"
				;;
			*)
				fail "Aborted. Install Node.js manually and re-run."
				;;
		esac
	else
		fail "Node.js needs to be installed manually on Linux. See https://nodejs.org/en/download/package-manager"
	fi
fi

# Re-verify
NODE_VERSION="$(node --version)"
ok "Using Node.js $NODE_VERSION"

# ---------- 2. Pulse token ----------
step "Pulse MCP token"

if [ -s "$TOKEN_FILE" ]; then
	info "Existing token found at $TOKEN_FILE"
	printf "  Replace it with a new token? ${BOLD}[y/N]${RESET} "
	read -r answer <"$PROMPT_FD"
	case "$answer" in
		y|Y|yes|YES) ;;
		*) ok "Keeping existing token"; SKIP_TOKEN=true ;;
	esac
fi

if [ "${SKIP_TOKEN:-false}" != "true" ]; then
	printf "\n  ${BOLD}${YELLOW}⚡ Action required${RESET}\n\n"
	cat <<'EOF'
  1. Open https://pulse.studiographene.com/profile in your browser.
  2. Find the "MCP Access" section.
  3. Click "Copy".
  4. Come back here and paste at the prompt below.

EOF
	printf "  ${BOLD}${YELLOW}→ Paste your token here, then press Enter:${RESET}\n"
	printf "  ${BOLD}> ${RESET}"
	read -r PULSE_TOKEN <"$PROMPT_FD"
	if [ -z "$PULSE_TOKEN" ]; then
		fail "No token provided."
	fi

	mkdir -p "$TOKEN_DIR"
	chmod 700 "$TOKEN_DIR"
	# Write JSON without echoing the token to terminal history.
	cat > "$TOKEN_FILE" <<EOF
{ "accessToken": "$PULSE_TOKEN" }
EOF
	chmod 600 "$TOKEN_FILE"
	ok "Token saved to $TOKEN_FILE (mode 0600)"
fi

# ---------- 3. Claude config ----------
step "Claude config"

if [ "$PLATFORM" = "mac" ]; then
	CONFIG_DIR="$CONFIG_DIR_MAC"
else
	CONFIG_DIR="$CONFIG_DIR_LINUX"
fi
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

mkdir -p "$CONFIG_DIR"

# Use python3 to merge JSON safely.
if ! command -v python3 >/dev/null 2>&1; then
	warn "python3 not found — cannot auto-edit Claude config."
	warn "Add this snippet manually to $CONFIG_FILE:"
	cat <<EOF

  {
    "mcpServers": {
      "pulse": {
        "command": "npx",
        "args": ["-y", "$PACKAGE_SOURCE"]
      }
    }
  }

EOF
else
	BACKUP_FILE="${CONFIG_FILE}.bak.$(date +%s)"
	if [ -f "$CONFIG_FILE" ]; then
		cp "$CONFIG_FILE" "$BACKUP_FILE"
		info "Backed up existing config to $BACKUP_FILE"
	fi

	python3 - "$CONFIG_FILE" "$PACKAGE_SOURCE" <<'PYEOF'
import json, os, sys
path, package_source = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    try:
        with open(path) as f:
            data = json.load(f) or {}
    except json.JSONDecodeError:
        sys.stderr.write(f"  ⚠ Existing config at {path} is not valid JSON. Aborting auto-edit; merge manually.\n")
        sys.exit(2)

mcp_servers = data.setdefault("mcpServers", {})
mcp_servers["pulse"] = {
    "command": "npx",
    "args": ["-y", package_source],
}

with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF

	if [ $? -eq 0 ]; then
		ok "Pulse MCP added to $CONFIG_FILE"
	else
		warn "Auto-edit failed — see message above and merge manually."
	fi
fi

# ---------- 4. Done ----------
step "All set"

cat <<EOF

  Last steps:
    1. ${BOLD}Quit Claude Cowork / Desktop completely${RESET} (Cmd+Q on macOS — closing the window
       isn't enough; the MCP server starts when the app launches).
    2. Re-open it.
    3. Ask Claude: ${BOLD}"Who am I on Pulse?"${RESET}

  If something doesn't work, check:
    • The token file:    $TOKEN_FILE
    • The Claude config: $CONFIG_FILE
    • Pulse MCP repo:    https://github.com/studiographene/pulse-mcp-server

EOF
