---
name: s3df-ssh-auth
description: Prepare, refresh, verify, or troubleshoot Mona's daily SLAC S3DF SSH key registration from her Mac before Codex Desktop or VS Code connects to psbuildrc or sdfiana. Use for S3DF authentication failures, expired registrations, Duo/SSO key renewal, or requests to confirm fresh uncached access to both remote hosts.
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

Finish by stating whether Codex Desktop can safely reconnect to both remote
projects.
