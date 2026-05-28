---
name: codex-skill-management
description: Use when managing Mona's personal Codex skills, including creating, updating, committing, pushing, and keeping ~/.codex/skills entries symlinked to ~/codex-skills.
---

# Codex Skill Management

Use this skill for Mona's personal Codex skills.

## Source of Truth

- Personal skills live in the git repo: `$HOME/codex-skills`.
- Installed personal skills under `$HOME/.codex/skills/<skill-name>` should be symlinks to `$HOME/codex-skills/<skill-name>`.
- Do not convert or edit system skills under `$HOME/.codex/skills/.system`.
- Do not convert plugin cache skills under `$HOME/.codex/plugins/cache`.

## New Server Bootstrap

Use this when setting up Mona's personal skills on a different server.

1. Clone the source repo if it is missing:

```bash
git clone git@github.com:monarin/codex-skills.git "$HOME/codex-skills"
```

2. Create the personal skill install directory:

```bash
mkdir -p "$HOME/.codex/skills"
```

3. Symlink the management skill first so future Codex sessions know this workflow:

```bash
ln -s "$HOME/codex-skills/codex-skill-management" "$HOME/.codex/skills/codex-skill-management"
```

4. Symlink each remaining personal skill from the repo:

```bash
ln -s "$HOME/codex-skills/daq-troubleshoot" "$HOME/.codex/skills/daq-troubleshoot"
ln -s "$HOME/codex-skills/gpu-cuda-python" "$HOME/.codex/skills/gpu-cuda-python"
ln -s "$HOME/codex-skills/slac-slack-mcp" "$HOME/.codex/skills/slac-slack-mcp"
```

5. Restart Codex so skill discovery reloads.

6. Verify the install:

```bash
find "$HOME/.codex/skills" -maxdepth 1 -mindepth 1 -printf '%y %p -> %l\n' | sort
git -C "$HOME/codex-skills" status --short --branch
```

Expected personal skills should show as symlinks (`l`) pointing into `$HOME/codex-skills`. The repo should be clean unless intentionally editing skills.

## Update Workflow

1. Inspect the installed skill and repo source:

```bash
readlink "$HOME/.codex/skills/<skill-name>"
git -C "$HOME/codex-skills" status --short
```

2. If the installed skill is not a symlink, copy it into `$HOME/codex-skills/<skill-name>` before replacing it.
3. Move the old installed directory to a timestamped backup outside `~/.codex/skills`, then create the symlink:

```bash
ln -s "$HOME/codex-skills/<skill-name>" "$HOME/.codex/skills/<skill-name>"
```

4. Edit the repo copy only.
5. Verify the symlink and compare any backup with the repo copy before discarding it:

```bash
readlink "$HOME/.codex/skills/<skill-name>"
diff -r <backup-dir>/<skill-name> "$HOME/codex-skills/<skill-name>"
```

6. Commit and push from `$HOME/codex-skills` when the user asks for persistent changes.

## Repair Existing Install

Use this when `$HOME/.codex/skills/<skill-name>` already exists and is not a symlink.

1. Confirm the skill is user-owned and not under `.system` or plugin cache.
2. Copy the existing installed directory into the repo if the repo copy is missing.
3. Compare the installed directory and repo copy:

```bash
diff -r "$HOME/.codex/skills/<skill-name>" "$HOME/codex-skills/<skill-name>"
```

4. If they match, move the installed directory to a timestamped backup outside `$HOME/.codex/skills`.
5. Create the symlink from `$HOME/.codex/skills/<skill-name>` to `$HOME/codex-skills/<skill-name>`.
6. Verify with `readlink` and `find`.

## Creating Skills

- Keep `SKILL.md` concise and task-focused.
- Add `agents/openai.yaml` for user-facing skill metadata when creating a new personal skill.
- Put reusable detailed notes in `references/`, scripts in `scripts/`, and output assets in `assets/` only when they directly support the skill.
- Do not commit secrets, tokens, private credentials, or copied logs that may contain sensitive values.
