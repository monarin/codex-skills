---
name: slac-slack-mcp
description: Use when helping Mona access Stanford/SLAC Slack from Codex through the local slack-mcp-bridge, inspect Slack threads/channels, or troubleshoot Slack MCP setup.
---

# SLAC Slack MCP

Use the local Slack MCP bridge for Codex Slack access.

Paths:

- Bridge checkout: `/cds/home/m/monarin/tmp/rwgk-stuff-slack/slack_mcp_bridge_info_public`
- Python venv: `/cds/home/m/monarin/tmp/slack-mcp-bridge-venv-py311`
- Private env file: `/cds/home/m/monarin/.slack_mcp_bridge_secrets/slack_mcp_bridge.env`
- Codex MCP config: `/cds/home/m/monarin/.codex/config.toml`

The MCP server is registered as `slack-mcp-bridge`:

```toml
[mcp_servers.slack-mcp-bridge]
command = "/cds/home/m/monarin/tmp/rwgk-stuff-slack/slack_mcp_bridge_info_public/run_slack_mcp_bridge.sh"
```

The private env file must contain:

```bash
SLACK_USER_TOKEN=xoxp-...
PYTHON=/cds/home/m/monarin/tmp/slack-mcp-bridge-venv-py311/bin/python
```

Use a Slack User OAuth token beginning with `xoxp-`, not `xoxb-` and not `xapp-`.

Expected Slack scopes:

- `search:read`
- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`
- `channels:read`
- `groups:read`
- `im:read`
- `mpim:read`
- `users:read`
- `users:read.email`

Security:

- Never print, paste, summarize, or commit the token value.
- Keep the env directory mode `700` and env file mode `600` or `400`.
- If the token is missing or invalid, ask the user to edit the env file themselves.

Validation:

- `codex mcp list`
- `codex mcp get slack-mcp-bridge`
- In a new Codex session, call `slack_health_check`, then `slack_get_my_info`.
- Search examples: `slack_search_messages(query="from:me", count=5, page=1)`.
