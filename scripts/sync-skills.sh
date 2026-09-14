#!/usr/bin/env bash
# sync-skills.sh - keep Claude Code and Codex personal skills symlinked to this repo.
#
# The repo (the parent of this scripts/ directory) is the single source of truth.
# Each top-level directory containing a SKILL.md is one skill. This script makes
# every agent's personal skill directory hold a symlink per skill:
#
#   ~/.claude/skills/<skill>  -> <repo>/<skill>   (Claude Code)
#   ~/.codex/skills/<skill>   -> <repo>/<skill>   (Codex)
#
# Usage:
#   sync-skills.sh [link]    create/refresh symlinks, prune dangling ones (default)
#   sync-skills.sh adopt     move real skill dirs an agent created into the repo,
#                            then replace them with symlinks
#   sync-skills.sh status    show link state for every skill
#   sync-skills.sh help
#
# Environment overrides:
#   AGENT_SKILLS_REPO     repo path (default: parent of this script)
#   AGENT_SKILLS_TARGETS  space-separated agent skill dirs
#                         (default: "$HOME/.claude/skills $HOME/.codex/skills")
#   AGENT_SKILLS_BACKUP   where `adopt` parks replaced copies
#                         (default: $HOME/.agent-skills-backup/<timestamp>)
#
# Works with macOS bash 3.2 and Linux bash; needs only coreutils + diff.

set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo="${AGENT_SKILLS_REPO:-$(cd "$script_dir/.." && pwd)}"
targets="${AGENT_SKILLS_TARGETS:-$HOME/.claude/skills $HOME/.codex/skills}"
backup_root="${AGENT_SKILLS_BACKUP:-$HOME/.agent-skills-backup/$(date +%Y%m%d-%H%M%S)}"

log()  { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -d "$repo" ] || die "repo not found: $repo"
repo_phys="$(cd -P "$repo" && pwd -P)"

# Print the names of skills in the repo (dirs with SKILL.md), one per line.
repo_skills() {
    local d
    for d in "$repo"/*/; do
        [ -d "$d" ] || continue
        [ -f "$d/SKILL.md" ] || continue
        basename "$d"
    done
}

# Return 0 if $1 is a symlink whose target lives directly inside the repo,
# even when the link text reaches the repo through another symlink
# (e.g. an old ~/codex-skills -> ~/agent-skills compatibility link).
links_into_repo() {
    local dest parent
    [ -L "$1" ] || return 1
    dest="$(readlink "$1")"
    case "$dest" in
        "$repo"/*) return 0 ;;
    esac
    parent="$(cd -P "$(dirname "$dest")" 2>/dev/null && pwd -P)" || return 1
    [ "$parent" = "$repo_phys" ]
}

link_one() {
    local skill="$1" target_dir="$2"
    local src="$repo/$skill" dst="$target_dir/$skill"
    if [ -L "$dst" ]; then
        if [ "$(readlink "$dst")" = "$src" ]; then
            log "  ok      $dst"
        else
            ln -sfn "$src" "$dst"
            log "  relink  $dst -> $src"
        fi
    elif [ -e "$dst" ]; then
        warn "  skip    $dst exists and is not a symlink (run: $0 adopt)"
    else
        ln -s "$src" "$dst"
        log "  link    $dst -> $src"
    fi
}

prune_dangling() {
    local target_dir="$1" entry
    for entry in "$target_dir"/* "$target_dir"/.[!.]*; do
        [ -L "$entry" ] || continue
        links_into_repo "$entry" || continue
        if [ ! -e "$entry" ]; then
            rm "$entry"
            log "  prune   $entry (skill no longer in repo)"
        fi
    done
}

cmd_link() {
    local target_dir skill
    log "repo: $repo"
    for target_dir in $targets; do
        mkdir -p "$target_dir"
        log "target: $target_dir"
        for skill in $(repo_skills); do
            link_one "$skill" "$target_dir"
        done
        prune_dangling "$target_dir"
    done
}

# Adopt real (non-symlink) skill directories that an agent created locally.
cmd_adopt() {
    local target_dir entry skill agent
    log "repo: $repo"
    for target_dir in $targets; do
        [ -d "$target_dir" ] || continue
        agent="$(basename "$(dirname "$target_dir")")"   # .claude or .codex
        log "target: $target_dir"
        for entry in "$target_dir"/*/; do
            [ -d "$entry" ] || continue
            entry="${entry%/}"
            skill="$(basename "$entry")"
            [ -L "$entry" ] && continue                   # already a link
            [ -f "$entry/SKILL.md" ] || { warn "  skip    $entry has no SKILL.md"; continue; }
            case "$skill" in .*) continue ;; esac         # .system etc.

            if [ ! -e "$repo/$skill" ]; then
                mv "$entry" "$repo/$skill"
                log "  adopt   $entry -> $repo/$skill"
                ln -s "$repo/$skill" "$entry"
                log "  link    $entry -> $repo/$skill"
            elif diff -rq "$entry" "$repo/$skill" >/dev/null 2>&1; then
                mkdir -p "$backup_root/$agent"
                mv "$entry" "$backup_root/$agent/$skill"
                ln -s "$repo/$skill" "$entry"
                log "  replace $entry (identical copy moved to $backup_root/$agent/$skill)"
            else
                warn "  conflict $entry differs from $repo/$skill; merge by hand:"
                warn "           diff -r '$entry' '$repo/$skill'"
            fi
        done
    done
    log
    log "Now run: $0 link"
    log "Then review with: git -C '$repo' status"
}

cmd_status() {
    local target_dir skill dst state
    log "repo: $repo"
    for target_dir in $targets; do
        log "target: $target_dir"
        for skill in $(repo_skills); do
            dst="$target_dir/$skill"
            if [ -L "$dst" ]; then
                if [ "$(readlink "$dst")" = "$repo/$skill" ]; then state="linked"
                elif [ -e "$dst" ]; then state="link->$(readlink "$dst")"
                else state="DANGLING"; fi
            elif [ -d "$dst" ]; then state="REAL DIR (adopt)"
            else state="missing"; fi
            printf '  %-32s %s\n' "$skill" "$state"
        done
        # Extra real dirs in the target not present in the repo.
        [ -d "$target_dir" ] || continue
        for dst in "$target_dir"/*/; do
            [ -d "$dst" ] || continue
            dst="${dst%/}"
            skill="$(basename "$dst")"
            [ -L "$dst" ] && continue
            [ -e "$repo/$skill" ] && continue
            printf '  %-32s %s\n' "$skill" "LOCAL ONLY (adopt)"
        done
    done
    log
    git -C "$repo" status --short --branch
}

case "${1:-link}" in
    link)   cmd_link ;;
    adopt)  cmd_adopt ;;
    status) cmd_status ;;
    help|-h|--help) sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//' ;;
    *) die "unknown command: $1 (use link|adopt|status|help)" ;;
esac
