---
name: ssh-connections
description: Manage and bootstrap Mona's macOS SSH configuration and access for SLAC S3DF (sdflogin, sdfiana, psbuildrc, and downstream hosts) and NERSC Perlmutter (sshproxy, DTNs, and compute-node hops). Use for connection setup, daily credential renewal, config changes, verification, or troubleshooting; use narrower host-specific skills for remote workload issues after SSH succeeds.
---

# SSH Connections

Manage Mona's SSH entry points from a local Mac. The checked-in config baseline
is [assets/ssh_config](assets/ssh_config); generated credentials and private keys
never belong in this repository.

## Guardrails

- Confirm `uname -s` is `Darwin` before renewing credentials or changing the
  Mac's SSH files. If the task is running remotely, ask Mona to run the workflow
  from a local Mac task.
- Never display, copy into chat, or commit private keys, certificates, passwords,
  OTPs, browser state, or authentication tokens. Inspect paths, permissions,
  fingerprints, and effective SSH options instead of key contents.
- Inspect `~/.ssh/config` before editing it. Preserve unrelated stanzas, make a
  timestamped backup, keep mode `0600`, and validate affected aliases with
  `ssh -G`. OpenSSH generally uses the first obtained value, so do not append a
  duplicate `Host` block and assume it overrides an earlier one.
- Never manually edit the generated `~/.ssh/s3df/s3df.conf`. The refresh helper
  owns it. Do not delete old S3DF keys or use `--force` without Mona's explicit
  request or concrete evidence that normal renewal cannot recover.
- Do not change pinned S3DF targets such as `sdfiana025` or
  `psbuild-rocky9-01` without first proving the configured target is unhealthy,
  testing a specific authoritative replacement, and obtaining Mona's approval
  for the exact old-to-new mapping.
- Keep normal host-key checking. The existing `nid??????` exception is limited
  to ephemeral Perlmutter compute nodes and matches NERSC's documented VS Code
  setup; do not broaden it.

## Bootstrap A Mac

For a new Mac or a machine missing this setup, read
[references/bootstrap-macos.md](references/bootstrap-macos.md) completely and
follow it. Treat the repo's top-level `README.md` as the entrypoint for a fresh
Codex installation.

## Inspect Or Verify

For a status-only request, do not renew credentials first.

1. Inspect effective options with `ssh -G <alias>` for the aliases in scope.
2. Run `scripts/verify-s3df-hosts.sh` for S3DF. It checks `sdflogin` and then
   independently checks both `psbuildrc` and `sdfiana` with connection sharing
   disabled.
3. For NERSC, run a noninteractive uncached probe:

   ```bash
   ssh -o BatchMode=yes -o NumberOfPasswordPrompts=0 \
     -o ConnectTimeout=20 -o ConnectionAttempts=1 \
     -o ControlMaster=no -o ControlPath=none perlmutter true
   ```

Use `scripts/verify-ssh-hosts.sh` when all managed entry points should be tested.
Report every host separately; one failed service must not suppress checks of the
other service.

## Renew S3DF Access

Run:

```bash
scripts/renew_s3df_key
```

This uses the bundled browser-backed registration helper, writes only the
generated S3DF include, and verifies the gateway plus both final hosts. If Chrome
opens, tell Mona to complete Stanford SSO and Duo herself. The helper reuses a
fresh accepted registration and refreshes or registers only when needed.

If Playwright is missing, install the pinned dependency from this skill directory
with `npm ci`, then retry. A status-only request does not authorize renewal.

When renewal fails, inspect only relevant metadata: the tail of
`~/.ssh/s3df/preconnect.log`, `ssh -G` output, file permissions, and concise SSH
diagnostics. Both `psbuildrc` and `sdfiana` failing usually indicates the shared
gateway or daily registration; one failing points to that target, route, or the
persistent internal identity.

## Renew Perlmutter Access

Run:

```bash
scripts/renew_nersc_key
```

This invokes `sshproxy -u monarin -o nersc`, leaves password-plus-OTP entry with
Mona, and then verifies `perlmutter`. Use `--fedid` when Mona requests browser
federated login. Never capture or relay credentials. The generated `~/.ssh/nersc`
key and certificate are short-lived and untracked.

If `sshproxy` is missing, use NERSC's current MFA documentation linked in the
bootstrap reference to install its signed universal macOS package. Do not fetch
an executable from an unofficial mirror.

## Modify Configuration

Use `assets/ssh_config` as a baseline, not as authority to overwrite a live file.
Compare it with the current file and change only requested stanzas. After an
edit, confirm permissions and effective values for every affected alias, then
perform a live check only if the request authorizes connection testing.

The expected topology is:

- `sdflogin` -> `sdflogin002.slac.stanford.edu`
- `sdfiana` -> `sdfiana025` through `sdflogin`
- `psbuildrc` -> `psbuild-rocky9-01` through `sdflogin`
- `drp-srcf-gpu003` through `psbuildrc`
- `perlmutter` -> `perlmutter.nersc.gov` using `~/.ssh/nersc`
- `dtn` -> `dtn.nersc.gov` using `~/.ssh/nersc`
- `nid??????` through `perlmutter.nersc.gov`

When a live connection succeeds and the issue moves to psana, DAQ, Slurm, or
remote development behavior, switch to the relevant narrower skill.
