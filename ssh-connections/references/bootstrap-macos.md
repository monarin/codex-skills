# Bootstrap Mona's SSH Connections On A Mac

Use this only on macOS. The source repository is
`git@github.com:monarin/codex-skills.git`. Never put private keys, certificates,
passwords, OTPs, or browser profiles in Git.

## 1. Install The Personal Skills

If `~/codex-skills` is absent, clone it. If it exists, inspect its status before
pulling and do not discard local changes.

```bash
git clone git@github.com:monarin/codex-skills.git "$HOME/codex-skills"
mkdir -p "$HOME/.codex/skills"
```

Symlink every skill with a `SKILL.md`. Refuse to replace a real directory:

```bash
for skill_path in "$HOME/codex-skills"/*; do
  [ -f "$skill_path/SKILL.md" ] || continue
  skill_name="$(basename "$skill_path")"
  target="$HOME/.codex/skills/$skill_name"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "Refusing to replace $target" >&2
    exit 1
  fi
  ln -sfn "$skill_path" "$target"
done
```

Install the S3DF browser automation dependency:

```bash
cd "$HOME/codex-skills/ssh-connections"
npm ci
```

Restart Codex after linking skills.

## 2. Prepare SSH Configuration

Create secure directories:

```bash
mkdir -p "$HOME/.ssh/controlmasters" "$HOME/.ssh/s3df"
chmod 700 "$HOME/.ssh" "$HOME/.ssh/controlmasters" "$HOME/.ssh/s3df"
```

The baseline is `~/codex-skills/ssh-connections/assets/ssh_config`. On an empty
setup it may be installed as `~/.ssh/config` with mode `0600`. If a config already
exists, back it up and merge the needed stanzas; do not overwrite it. Avoid
duplicate aliases because OpenSSH keeps the first value it obtains.

The baseline assumes Mona's local, SLAC, and NERSC username is `monarin`. If the
new Mac's local account differs, add or uncomment `User monarin` in every NERSC
and SLAC stanza before installing it. Validate with:

```bash
ssh -G sdflogin >/dev/null
ssh -G psbuildrc >/dev/null
ssh -G sdfiana >/dev/null
ssh -G perlmutter >/dev/null
```

Do not copy `known_hosts` blindly. Establish and verify host keys normally. For
NERSC, compare fingerprints with its current official connection documentation.

## 3. Provision Credentials Without Putting Them In Git

S3DF uses two layers:

- The daily gateway identity is created and registered by
  `scripts/renew_s3df_key`.
- The persistent internal identity is expected at
  `~/.ssh/s3df/s3df-internal-ed25519`.

For the internal identity, either have Mona authorize a secure device-to-device
transfer from her existing Mac or generate a new key and add its public key from
an already authenticated S3DF session. Codex must not print or transport the
private key through chat, logs, Git, or a public-key registration page meant for
the daily gateway key. Set directory mode `0700` and private-key mode `0600`.

For NERSC, install the signed universal macOS `sshproxy` package from
[NERSC's MFA documentation](https://docs.nersc.gov/connect/mfa/). Do not copy an
expired `~/.ssh/nersc`; generate a fresh credential with:

```bash
"$HOME/.codex/skills/ssh-connections/scripts/renew_nersc_key"
```

Mona enters her NERSC password plus OTP directly into `sshproxy`. For browser
federated login, pass `--fedid`.

## 4. Renew S3DF And Verify Everything

Run:

```bash
"$HOME/.codex/skills/ssh-connections/scripts/renew_s3df_key"
"$HOME/.codex/skills/ssh-connections/scripts/verify-ssh-hosts.sh"
```

Mona completes Stanford SSO and Duo in the dedicated Chrome profile if prompted.
The final report should list `sdflogin`, `psbuildrc`, `sdfiana`, and `perlmutter`
separately.

## 5. Optional Shell Convenience Functions

Add these to Mona's shell startup file only when she requests it:

```bash
renew_s3df_key() {
  "$HOME/.codex/skills/ssh-connections/scripts/renew_s3df_key" "$@"
}

renew_nersc_key() {
  "$HOME/.codex/skills/ssh-connections/scripts/renew_nersc_key" "$@"
}
```

After setup, confirm that installed personal skills are symlinks into
`~/codex-skills` and that the repository remains clean.
