# agent-skills

Mona's personal skills, shared by Claude Code and Codex. One directory per
skill, each with a `SKILL.md` (frontmatter `name` + `description`) that both
agents understand. Codex also reads the optional `agents/openai.yaml`.

Clone to `~/agent-skills`. Agents never read this directory directly; they read
symlinks that `scripts/sync-skills.sh` maintains:

| Agent       | Install dir         | Points to               |
|-------------|---------------------|-------------------------|
| Claude Code | `~/.claude/skills/` | `~/agent-skills/<skill>` |
| Codex       | `~/.codex/skills/`  | `~/agent-skills/<skill>` |

## Set up a machine

Prerequisites: Git, GitHub SSH access to this repo, and Claude Code and/or Codex.

```bash
git clone git@github.com:monarin/codex-skills.git ~/agent-skills
~/agent-skills/scripts/sync-skills.sh adopt   # only if an agent already created skills locally
~/agent-skills/scripts/sync-skills.sh link
~/agent-skills/scripts/sync-skills.sh status
```

Restart the agent so it rescans skills. `link` never replaces a real directory;
`adopt` moves such directories into the repo first and links them back.

### Migrating an existing `~/codex-skills` checkout

```bash
mv ~/codex-skills ~/agent-skills
ln -s ~/agent-skills ~/codex-skills   # optional compatibility link
~/agent-skills/scripts/sync-skills.sh link
```

Existing `~/.codex/skills` links are rewritten to the new path and stale ones
are pruned.

## Bootstrap SSH connections (Mac)

Ask the agent to use the `ssh-connections` skill and follow
`ssh-connections/references/bootstrap-macos.md`. That workflow contains the
current non-secret SSH config baseline and setup for:

- SLAC S3DF daily key registration and the `sdflogin` -> `psbuildrc`/`sdfiana`
  routes;
- the `renew_s3df_key` convenience command and connection verification;
- NERSC's one-day `sshproxy` credential for Perlmutter, DTNs, and compute-node
  hops.

It needs Node.js 18 or newer, npm, and Google Chrome. Install its pinned
browser dependency before the first S3DF refresh:

```bash
cd ~/agent-skills/ssh-connections
npm ci
```

Private keys, certificates, passwords, OTPs, and browser profiles are
deliberately excluded. The bootstrap guide explains how to provision them
without putting secrets in Git.

## Day to day

- Edit skills in `~/agent-skills`, commit, push only the intended files.
- Other machines: `git pull --ff-only` then `sync-skills.sh link`
  (only needed when skills were added or removed).
- An agent wrote a new skill into its own dir? `sync-skills.sh adopt` moves it
  into the repo and links it back.
- Codex users can validate a changed skill with Codex's `quick_validate.py`.
- Never commit secrets, tokens, private credentials, or copied authentication
  logs.

See `skill-management/SKILL.md` for the full workflow the agents follow.

The GitHub repo keeps its original name `codex-skills`; the local checkout is
`~/agent-skills`, with `~/codex-skills` optionally left as a symlink for
anything still pointing at the old path.
