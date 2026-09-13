# Mona's Codex Skills

This repository is the source of truth for Mona's personal Codex skills. A fresh
Mac should clone it to `~/codex-skills` and install each skill as a symlink under
`~/.codex/skills`.

## Bootstrap Codex Skills On Another Mac

Prerequisites are Git, GitHub SSH access to this private repository, and Codex.
The SSH workflow additionally needs Node.js 18 or newer, npm, and Google Chrome.

Do not replace an existing non-symlink skill directory or discard local Git
changes. Clone the repo if needed, then link every skill:

```bash
git clone git@github.com:monarin/codex-skills.git "$HOME/codex-skills"
mkdir -p "$HOME/.codex/skills"

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

Restart Codex so skill discovery reloads. Verify that the links point into the
repo and that Git is clean:

```bash
find "$HOME/.codex/skills" -maxdepth 1 -mindepth 1 -type l -exec ls -ld {} \; | sort
git -C "$HOME/codex-skills" status --short --branch
```

## Bootstrap SSH Connections

Ask Codex to use `$ssh-connections` and follow
`ssh-connections/references/bootstrap-macos.md`. That workflow contains the
current non-secret SSH config baseline and setup for:

- SLAC S3DF daily key registration and the `sdflogin` -> `psbuildrc`/`sdfiana`
  routes;
- the `renew_s3df_key` convenience command and connection verification;
- NERSC's one-day `sshproxy` credential for Perlmutter, DTNs, and compute-node
  hops.

Install its pinned browser dependency before the first S3DF refresh:

```bash
cd "$HOME/codex-skills/ssh-connections"
npm ci
```

Private keys, certificates, passwords, OTPs, and browser profiles are deliberately
excluded. The bootstrap guide explains how to provision them without putting
secrets in Git.

## Maintaining Skills

Edit the repo copy, keep `~/.codex/skills/<name>` symlinked to it, validate
changed skills with Codex's `quick_validate.py`, and commit and push only the
intended files. Never commit secrets, tokens, private credentials, or copied
authentication logs.
