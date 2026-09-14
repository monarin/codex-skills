---
name: skill-management
description: Use when managing Mona's personal agent skills shared by Claude Code and Codex, including creating, updating, adopting, committing, pushing skills in ~/agent-skills, and keeping ~/.claude/skills and ~/.codex/skills symlinked to it on any machine (SDF, Mac, Perlmutter).
---

# Skill Management

Use this skill for Mona's personal skills. One git repo is the source of truth
for both Claude Code and Codex; each agent only sees symlinks into it.

## Source of Truth

- Repo: `$HOME/agent-skills` (GitHub `monarin/codex-skills`, kept under the old
  name; `$HOME/codex-skills` may exist as a compatibility symlink to it).
- One skill = one top-level directory containing `SKILL.md`. Both agents read
  the same `SKILL.md` frontmatter (`name`, `description`). Codex additionally
  reads `agents/openai.yaml`; Claude Code ignores it.
- Installed skills are symlinks, never copies:
  - `$HOME/.claude/skills/<skill>` -> `$HOME/agent-skills/<skill>` (Claude Code)
  - `$HOME/.codex/skills/<skill>`  -> `$HOME/agent-skills/<skill>` (Codex)
- Never edit an installed path directly; edit the repo copy (the symlink makes
  this the same thing, but `git status` must be run in the repo).
- Do not touch system or plugin skills: `$HOME/.codex/skills/.system`,
  `$HOME/.codex/plugins/cache`, `$HOME/.claude/plugins`.

## The Sync Script

`scripts/sync-skills.sh` in the repo does all link maintenance. It is plain
bash and runs on macOS and Linux.

```bash
~/agent-skills/scripts/sync-skills.sh status   # show link state per agent
~/agent-skills/scripts/sync-skills.sh link     # create/refresh links, prune stale ones
~/agent-skills/scripts/sync-skills.sh adopt    # pull agent-created real dirs into the repo
```

`link` is idempotent. `adopt` moves any real (non-symlink) skill directory it
finds under `~/.claude/skills` or `~/.codex/skills` into the repo and replaces
it with a symlink. If the repo already has a skill with that name and the
contents differ, it leaves both in place and prints a `diff -r` command; merge
by hand, then rerun `adopt`.

## New Machine Bootstrap

```bash
git clone git@github.com:monarin/codex-skills.git "$HOME/agent-skills"
"$HOME/agent-skills/scripts/sync-skills.sh" adopt   # only if the agent already created local skills
"$HOME/agent-skills/scripts/sync-skills.sh" link
"$HOME/agent-skills/scripts/sync-skills.sh" status
```

Restart Claude Code / Codex so skill discovery reloads. If the shell has the
`goodstuffs` bashrc, `agent_skills_sync` runs clone-or-pull plus `link`.

## Adopting Skills an Agent Created Locally

When Claude Code (`~/.claude/skills/<name>`) or Codex (`~/.codex/skills/<name>`)
writes a new skill as a real directory on some machine:

1. `~/agent-skills/scripts/sync-skills.sh adopt`
2. Review `git -C ~/agent-skills status`, then read the adopted `SKILL.md`.
3. Add `agents/openai.yaml` if Codex should show it in its skill picker.
4. Commit and push from `~/agent-skills`.
5. On every other machine: `git -C ~/agent-skills pull --ff-only` then
   `~/agent-skills/scripts/sync-skills.sh link`.

## Update Workflow

1. `git -C ~/agent-skills status --short` to see pending edits first.
2. Edit `~/agent-skills/<skill>/...`.
3. Commit and push from `~/agent-skills` when the user asks for persistent
   changes. Keep unrelated pending edits out of the commit (`git add <paths>`).
4. Pull on other machines and rerun `link` (only needed when skills are added
   or removed; edits to existing skills are picked up through the symlink).

## Creating Skills

- Directory name, `name` frontmatter, and the wording the description triggers
  on should agree. Keep `SKILL.md` concise and task-focused.
- Write `SKILL.md` so it works for either agent: no `$skill` Codex-only syntax
  or `/skill` Claude-only syntax in the body; say "use the X skill" instead.
- Put detailed notes in `references/`, scripts in `scripts/`, output assets in
  `assets/` only when they directly support the skill.
- Add `agents/openai.yaml` (display_name, short_description, default_prompt)
  so Codex lists the skill nicely.
- Do not commit secrets, tokens, private credentials, or copied logs that may
  contain sensitive values.
- After adding or removing a skill directory, run `sync-skills.sh link` so
  both agents see the change.
