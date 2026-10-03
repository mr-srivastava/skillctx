# Implementation plan: Phase 0, skill inventory

> **Historical record.** This is the Phase 0 plan as written on October 2, 2026, and it is complete. It is not the current task list. Since then, [ADR-021](../docs/decisions/ADR-021-skillctx-becomes-a-skill-manager.md) made skillctx a skill manager and [ADR-022](../docs/decisions/ADR-022-deploying-into-agent-folders.md) decided how it writes into agent folders, so statements here that the UI or skillctx must stay read-only no longer apply. File paths and some details differ from the code; trust the code and `docs/spec.md`.

## Overview

Build `skillctx init`, `skillctx inventory [--check]` and `skillctx ui`: a read-only inventory of every agent skill on the machine, written as plain files into a user-chosen workspace, with a local web UI. Governing decisions: ADR-004 (TypeScript + Bun), ADR-005 (CLI + local web UI), ADR-009 (workspace), ADR-010 (inventory first). Domain terms: `GLOSSARY.md`.

## What's on the author's machine (surveyed 2026-10-02)

This shapes the design more than any spec text.

| Root | Entries | Notes |
| --- | --- | --- |
| `~/.agents/skills` | 97 | The real copies. 8 entries are symlinks into a git checkout (`~/.understand-anything/repo/...`) |
| `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/skills`, `~/.config/opencode/skills` | 97–98 each | All symlinks into `~/.agents/skills`. `~/.claude/skills/synced` is a real folder |
| `~/.skills-manager/skills` | 100 | Byte copies, not symlinks. Its SQLite `skills` table marks all 100 as `source_type=import` from `~/.cursor/skills`, with no remote revision |
| `~/.claude/plugins/cache/**/skills` | 2 | Plugin-installed skills (paper-desktop) |
| `~/.agents/.skill-lock.json` | 83 entries | npx skills lock v3: `source`, `sourceUrl`, `skillPath`, `skillFolderHash` (40-hex, looks like a git tree SHA), `installedAt`, `updatedAt`. 17 distinct GitHub repos. 14 skills in `~/.agents/skills` are not in the lock |

Implications:
- Realpath dedupe collapses ~590 directory entries into roughly 100 skills. It must come first.
- Skills Manager here adds copies but no update information. Outdated checks for this machine come from the npx lockfile and the git checkout.
- An outdated check needs at most ~17 GitHub requests, inside the unauthenticated limit of 60/hour.

## Architecture decisions for this phase

- **Single package, three module groups:** `src/core` (workspace, sources, indexer, upstream, inventory), `src/cli`, `src/ui` (local server + web client). Core has no knowledge of CLI or UI.
- **Source adapters only enumerate.** `list()` returns skill folders with provenance. The Indexer owns realpath resolution, hashing, grouping, drift and diagnostics (engine review, candidate 4). Plain-folder discovery is the baseline; provenance adapters enrich it.
- **Normalized content hash:** sorted relative paths plus file bytes, with known provenance frontmatter keys stripped, so the same skill matches across sources. Prefixed with a scheme version (`h1:`).
- **Inventory files:** `<home>/inventory/skills/<name>.json` (one file per skill, small diffs) plus `<home>/inventory/summary.json`. Stable key order. Paths stored relative to `~`. A run that finds nothing new produces no diff.
- **Workspace pointer:** `~/.config/skillctx/config.json` holds the path to `<home>`, so commands work from anywhere. Overridable with `--home` or `SKILLCTX_HOME`.
- **Outdated check runs only under `inventory --check` or the UI refresh button.** GitHub requests use `gh auth token` if available, else unauthenticated. Responses are cached in `<home>/.cache/`. Git checkouts are compared with `git ls-remote`.
- **Local UI:** `Bun.serve` on 127.0.0.1, JSON endpoints over the inventory files, a per-session token required for the refresh action. Client stack is an open question below; the plan assumes React + Vite built into static assets served by the CLI.
- **Never write outside `<home>`.** Enforced by a single write helper that refuses paths outside the workspace. A test asserts it.

## Task list

Tasks are detailed in `tasks/todo.md`.

### Foundation
- Task 1: Project scaffold
- Task 2: Workspace init

### Checkpoint A

### Local inventory (first vertical slice)
- Task 3: Root discovery and plain-folder source
- Task 4: Indexer: parse, hash, group, drift
- Task 5: `skillctx inventory` writes inventory files

### Checkpoint B: real-machine run

### Provenance
- Task 6: npx skills lockfile adapter
- Task 7: Git checkout and gh skill provenance
- Task 8: Skills Manager adapter
- Task 9: Claude plugin skills adapter

### Checkpoint C

### Outdated check
- Task 10: Upstream checker and `inventory --check`

### Local UI
- Task 11: Local server and API
- Task 12: Skills list view
- Task 13: Skill detail view
- Task 14: Refresh from the UI

### Checkpoint D: Phase 0 complete
- Task 15 (optional): Workspace backup helper

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| npx skills lockfile format is undocumented and may change | Med | Parse defensively with a schema; unknown versions degrade to "no provenance", never crash |
| `skillFolderHash` is not what we assume (git tree SHA) | Med | Verify against one known skill in Task 10 before relying on it; fall back to comparing `updatedAt` with the repo's last commit touching `skillPath` |
| Skills Manager DB schema changes | Low | Open read-only, check expected columns, skip on mismatch |
| Symlink loops or huge folders slow the scan | Low | Track visited realpaths; cap depth; skip `node_modules`, `.git` |
| GitHub rate limit when unauthenticated | Low | ~17 requests today; cache responses; use `gh` token when present |
| Absolute paths leak into the workspace | Med | Path helper converts to `~`-relative; test scans inventory files for the home dir prefix |
| UI scope creep toward a manager (install, deploy) | Med | ADR-010 non-goals; UI has no write actions except refresh |

## Decisions on open questions (2026-10-02)

The user chose the defaults: React + Vite UI; Skills Manager via its SQLite DB, read-only; project-level skill roots deferred; Claude plugin skills included as optional Task 9; keep the `skillctx` name and check npm before publishing.

## Original open questions

1. **UI client stack.** React + Vite (matches your usual stack) or something lighter (server-rendered HTML with a little JS)? Plan assumes React + Vite.
2. **Skills Manager:** read its SQLite DB directly (fast, schema risk) or call its `--json` CLI (stable, needs the app's binary)? Plan assumes the DB, read-only.
3. **Project-level skill roots** (`<repo>/.claude/skills`, `<repo>/.agents/skills`): include in Phase 0 by registering project paths, or defer? Plan defers them.
4. **Claude plugin skills:** include (Task 9) or skip for now?
5. **Name for the binary and npm package.** `skillctx` is a working name; npm availability unchecked.
