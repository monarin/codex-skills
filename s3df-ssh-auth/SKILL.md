---
name: s3df-ssh-auth
description: Prepare, refresh, verify, or troubleshoot Mona's daily SLAC S3DF SSH key registration from her Mac before Codex Desktop or VS Code connects to psbuildrc or sdfiana. Use for authentication failures, expired registrations, Duo/SSO key renewal, fresh uncached access checks, or recovery from an unhealthy pinned landing node.
---

# S3DF SSH Authentication

Manage S3DF authentication from a local macOS task. Keep the existing Mac-side
refresh script as the source of truth, and verify both development and analysis
hosts after every preparation or refresh.

## Guardrails

- Run this workflow only on Mona's Mac. Confirm `uname -s` returns `Darwin`.
- If the active task is already running on an SSH host, stop and ask Mona to
  invoke this skill from a local Mac task. The refresh controls Mac Chrome and
  writes the Mac's SSH configuration.
- Never display, copy, or inspect private-key contents or authentication tokens.
- Do not manually edit generated `~/.ssh/s3df/s3df.conf` or delete old keys.
- Do not use `--force` unless Mona explicitly requests it or normal refresh has
  failed and the evidence shows a forced registration is necessary.
- Never change a landing node in `~/.ssh/config` without Mona's explicit
  approval for the exact alias, old target, and proposed new target.

## Prepare Or Refresh Access

1. Confirm the refresh helper exists and is executable:

   ```bash
   test -x "$HOME/goodstuffs/bin/s3df-key-refresh.sh"
   ```

2. Run it without extra flags:

   ```bash
   "$HOME/goodstuffs/bin/s3df-key-refresh.sh"
   ```

   Allow time for the dedicated Chrome profile to open. Tell Mona to complete
   Stanford SSO and Duo if prompted. The helper skips registration when the
   current key is fresh and accepted.

3. After the helper succeeds, always run `scripts/verify-s3df-hosts.sh` from
   this skill directory. It first checks `sdflogin` directly with connection
   sharing disabled, then independently checks both `psbuildrc` and `sdfiana`
   using noninteractive public-key authentication. Do not skip either final
   host when only one was named in the request.

4. Report a separate result for each host. If gateway authentication fails,
   report both final hosts as blocked by that shared prerequisite. A successful
   check has no remote command output; the verification script prints `OK`
   itself.

## Status-Only Requests

For a request that explicitly asks only to inspect or validate current access,
do not refresh first. Run `scripts/verify-s3df-hosts.sh`. If both checks pass,
report that no refresh was needed. If either fails, explain that preparation
requires running the refresh helper and ask for confirmation only if the
original request did not authorize a refresh.

## Troubleshoot Failures

If either verification fails:

1. Still complete the other host check.
2. Inspect only relevant metadata:

   ```bash
   tail -n 40 "$HOME/.ssh/s3df/preconnect.log"
   ssh -G sdflogin
   ssh -G psbuildrc
   ssh -G sdfiana
   ```

3. Confirm the login aliases resolve to the registered S3DF key and the
   internal aliases resolve to the internal key without reading either key.
4. Interpret failures by scope:
   - Both hosts fail: suspect the daily login registration or jump-host access.
   - Only `psbuildrc` fails: suspect its target, internal key, or route.
   - Only `sdfiana` fails: suspect its target name, internal key, or route from
     `sdflogin`.
5. Use verbose SSH diagnostics only when necessary, keep connection sharing
   disabled, and summarize the relevant lines rather than returning a large
   debug log.

## Recover An Unhealthy Landing Node

Use this only when `sdflogin` succeeds but `psbuildrc` or `sdfiana` fails with
a transport error such as a connection timeout, banner-exchange timeout,
connection refusal, or no route. An authentication or host-key failure alone
does not establish that the configured landing node is unhealthy.

1. Resolve the pinned target with `ssh -G <alias>` and report it. Test the other
   final alias too so a shared gateway problem is not mistaken for a bad node.
2. Probe a known candidate supplied by Mona or returned by authoritative S3DF
   host discovery. Do not invent or broadly scan numbered hosts. Use the same
   `sdflogin` jump, internal identity, noninteractive authentication, timeout,
   and disabled connection sharing as normal verification.
3. When a candidate hostname is not already in `known_hosts`, use a temporary
   `UserKnownHostsFile` for the reachability probe. Do not weaken host-key
   checking in persistent SSH configuration. The final normal connection must
   perform ordinary host-key verification.
4. Treat a successful noninteractive remote `true` as evidence that the
   candidate is usable. Before editing, show Mona the exact proposed mapping,
   for example `sdfiana: sdfiana004 -> sdfiana025`, and ask for explicit
   approval. A request to diagnose or reconnect is not approval to mutate SSH
   configuration.
5. After approval, make a narrow edit to the matching `Host` stanza in
   `~/.ssh/config`; never edit the generated `~/.ssh/s3df/s3df.conf`. Preserve
   file mode `0600` and every unrelated setting.
6. Validate the effective target with `ssh -G <alias>`, then rerun
   `scripts/verify-s3df-hosts.sh`. Report `sdflogin`, `psbuildrc`, and
   `sdfiana` separately, including any normal host-key confirmation that Mona
   must complete before Codex Desktop reconnects.

Finish by stating whether Codex Desktop can safely reconnect to both remote
projects.
