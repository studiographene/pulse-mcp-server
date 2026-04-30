# Security

## Reporting a vulnerability

Please report suspected security vulnerabilities **privately** rather than opening a public issue.

Contact: **security@studiographene.com**

We aim to acknowledge new reports within 2 working days and to provide a substantive response (fix timeline, mitigation, or rejection with reasoning) within 14 days.

## Scope

This repository is the Pulse MCP server — a thin wrapper around the Pulse REST API for use with Model Context Protocol clients (Claude Desktop, Cowork, Code, and others).

In scope for security reports:

- Vulnerabilities in the MCP server code itself (auth handling, request signing, response parsing, tool input validation)
- Issues that could allow a Claude client or local user to escalate beyond the privileges of their Pulse account
- Telemetry leakage (the MCP must never send tool arguments, response bodies, or user queries — see [README § Telemetry](./README.md#telemetry))
- Dependency vulnerabilities affecting the runtime path (Dependabot also files these automatically)

Out of scope (please report to the relevant owner instead):

- Vulnerabilities in the Pulse BE / FE itself (security@studiographene.com handles routing)
- Vulnerabilities in upstream MCP SDK or Anthropic clients
- Issues that require a compromised local machine (the MCP runs in the user's own process and trusts the local environment)

## What gets stored

The MCP stores a single Pulse access token at `~/.pulse-mcp/token.json` with `0600` permissions. No other persistent state. The token is sent only to the configured Pulse API host (default `prod.apis.pulse.studiographene.com`) and never to third parties.

Telemetry events sent to Amplitude contain only tool name, category, duration, success/error outcome, error class, MCP version, platform, Node version, and the Pulse user UUID. Tool arguments and response bodies are never included.
