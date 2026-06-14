---
name: playwright-mac-browser
description: Manage Mona's Playwright MCP setup for letting Codex running inside VS Code Remote-SSH on SDF or another remote host access Mona's Mac Chrome session. Use when setting up a new remote VS Code/Codex host, debugging the Mac Playwright tunnel, checking whether Playwright browser tools should be available, or reminding Mona which Mac-side commands to run.
---

# Playwright Mac Browser

## Model

Treat VS Code Remote-SSH as a split environment:

- Mac: VS Code UI, Chrome, Playwright MCP server, SSH client.
- Remote host: VS Code server, Codex extension/agent, workspace, `~/.codex/config.toml`.

Codex runs where the VS Code remote server runs. In an SDF Remote-SSH window, shell commands and Codex MCP config are on SDF, while the authenticated browser is on the Mac.

## Mac Setup Reminder

Prerequisites on the Mac:

```bash
node --version
npm --version
npx -y @playwright/mcp@latest --help
```

Use `~/goodstuffs/bashrc` helpers after pulling the current repo and sourcing it:

```bash
cd ~/goodstuffs
git pull
source ~/goodstuffs/bashrc
```

Run these on the Mac while Codex needs browser access:

```bash
codex_playwright_mcp
codex_playwright_tunnel
```

Current helper defaults:

- `codex_playwright_mcp` starts `@playwright/mcp` extension mode on `127.0.0.1:8932`.
- `codex_playwright_tunnel` runs `ssh -N -R 127.0.0.1:8932:localhost:8932 sdfiana`.
- `sdfiana` is expected to be a Mac SSH alias that handles the required `ProxyJump`.

If setting up a different remote host, either add a Mac SSH alias for that host or pass it explicitly:

```bash
codex_playwright_tunnel <ssh-host-or-alias>
```

Use a raw tunnel command when diagnosing:

```bash
ssh -o ExitOnForwardFailure=yes -N -R 127.0.0.1:8932:localhost:8932 <ssh-host-or-alias>
```

Avoid `-vv` unless debugging SSH itself.

## Remote Host Setup

On each remote host where Codex runs, configure that host's `~/.codex/config.toml`:

```toml
[mcp_servers.playwright-local]
url = "http://localhost:8932/mcp"
enabled = true
startup_timeout_sec = 30
```

If `codex` is on `PATH`, verify with:

```bash
codex mcp list
```

If `codex` is not on `PATH` in a VS Code Remote-SSH shell, locate the bundled binary:

```bash
find "$HOME/.vscode-server/extensions" -path '*openai*' -type f -name codex -print
```

After editing MCP config, restart or reload the VS Code Codex session. Existing Codex sessions do not gain newly configured MCP tools.

## Validation

Check the tunnel from the remote host:

```bash
curl -i --max-time 5 http://localhost:8932/mcp
```

Expected: an HTTP response such as `400 Bad Request` / `Invalid request`. That is normal for raw curl and means the MCP server is reachable. `connection refused` means the Mac tunnel is not active or is pointed at the wrong remote host.

Then use the Playwright MCP tools:

```text
Use Playwright to list visible browser tabs.
```

If tools are loaded, `browser_tabs` should list the Mac Chrome tabs approved through the Playwright extension.

## Multiple Hosts

Several remote hosts can connect to the same Mac Playwright MCP server. Run one `codex_playwright_mcp` on the Mac, then keep one SSH reverse tunnel open per remote host:

```bash
ssh -N -R 127.0.0.1:8932:localhost:8932 <host-a>
ssh -N -R 127.0.0.1:8932:localhost:8932 <host-b>
```

The same remote port can be reused on different remote hosts because each host has its own loopback interface. On the same remote host, only one process can bind `127.0.0.1:8932`; share the existing tunnel or choose different remote ports and update that host's Codex config.

Concurrent Codex sessions share the same Mac Chrome session and tabs. Use one browser-driving task at a time unless cross-session interference is acceptable.

## Troubleshooting

- Mac `EADDRINUSE` on `8932`: another Playwright MCP server is already running, or another process owns the port. Check with `lsof -nP -iTCP:8932 -sTCP:LISTEN`.
- Remote `connection refused`: restart the Mac tunnel with `ExitOnForwardFailure=yes` and confirm the SSH alias reaches the same host as `hostname -f` in Codex.
- Playwright server returns "Access is only allowed at localhost:8932": use `http://localhost:8932/mcp` in remote Codex config, not a mismatched host/port.
- No Playwright tools in Codex after config changes: restart/reload the VS Code Codex session.
