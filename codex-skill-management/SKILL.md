---
name: codex-skill-management
description: Use when managing Mona's personal Codex skills, including creating, updating, committing, pushing, and keeping ~/.codex/skills entries symlinked to ~/codex-skills.
---

# Codex Skill Management

Use this skill for Mona's personal Codex skills.

## Source of Truth

- Personal skills live in the git repo: `/cds/home/m/monarin/codex-skills`.
- Installed personal skills under `/cds/home/m/monarin/.codex/skills/<skill-name>` should be symlinks to `/cds/home/m/monarin/codex-skills/<skill-name>`.
- Do not convert or edit system skills under `/cds/home/m/monarin/.codex/skills/.system`.
- Do not convert plugin cache skills under `/cds/home/m/monarin/.codex/plugins/cache`.

## Update Workflow

1. Inspect the installed skill and repo source:

```bash
readlink /cds/home/m/monarin/.codex/skills/<skill-name>
git -C /cds/home/m/monarin/codex-skills status --short
```

2. If the installed skill is not a symlink, copy it into `/cds/home/m/monarin/codex-skills/<skill-name>` before replacing it.
3. Move the old installed directory to a timestamped backup outside `~/.codex/skills`, then create the symlink:

```bash
ln -s /cds/home/m/monarin/codex-skills/<skill-name> /cds/home/m/monarin/.codex/skills/<skill-name>
```

4. Edit the repo copy only.
5. Verify the symlink and compare any backup with the repo copy before discarding it:

```bash
readlink /cds/home/m/monarin/.codex/skills/<skill-name>
diff -r <backup-dir>/<skill-name> /cds/home/m/monarin/codex-skills/<skill-name>
```

6. Commit and push from `/cds/home/m/monarin/codex-skills` when the user asks for persistent changes.

## Creating Skills

- Keep `SKILL.md` concise and task-focused.
- Add `agents/openai.yaml` for user-facing skill metadata when creating a new personal skill.
- Put reusable detailed notes in `references/`, scripts in `scripts/`, and output assets in `assets/` only when they directly support the skill.
- Do not commit secrets, tokens, private credentials, or copied logs that may contain sensitive values.
