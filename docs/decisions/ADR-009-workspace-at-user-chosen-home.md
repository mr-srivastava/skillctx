# ADR-009: All skillctx data lives in one workspace at a user-chosen path

## Status
Accepted. Supersedes the storage locations in ADR-003 (the three-layer cascade itself still holds). Amends ADR-001: compiled output is written to the workspace. Amended by ADR-021 (the workspace gains a library, a lockfile and `build/`, and what gets committed) and ADR-022 (skillctx writes into agent folders, only to entries in its deployment record). Amended by ADR-025: project versions are always kept in the workspace, never in `<repo>/.skillctx/`; a repo gets only a built copy. The opt-in still applies to Phase 5 lenses.

## Date
2026-10-02

## Context
ADR-003 split our data between `~/.skillctx/store`, rebuildable SQLite in `~/.skillctx/`, and `<repo>/.skillctx/` in each project. ADR-001 wrote compiled skills straight into `.claude/skills` and `.agents/skills`. That scatters our state across the machine and mixes it into folders other tools own. The user wants one place that holds everything skillctx produces, that they can back up to their own GitHub repo now and to cloud storage later.

## Decision
`skillctx init --home <path>` creates a workspace at a path the user chooses. Everything skillctx owns lives there:

```
<home>/
  skillctx.yaml      workspace config: sources, agents, settings
  inventory/         installed skills, locations, versions, outdated status
  variants/          personal overrides (later)
  profiles/          named skill sets (later)
  projects/<name>/   per-project lens and patches (later)
  compiled/          compiler output (later)
  .cache/            index.db, events.db; rebuildable, git-ignored
```

Rules that keep backup options open:
- Everything outside `.cache/` is plain text (YAML, JSON, Markdown), stable-sorted so diffs stay small.
- No machine-specific absolute paths in committed files. Source roots and project locations are stored relative to well-known bases (`~`, the project root) or resolved per machine in an ignored local file.
- The workspace works as a plain folder. `git init` and pushing it to the user's own GitHub repo is supported from day one; cloud storage is a future second backup adapter. Until that second adapter exists we don't build a backup seam, only keep the data shape portable.

Project overrides default to `<home>/projects/<name>/`. A project can opt to keep its lens and patches in `<repo>/.skillctx/` instead, so they travel with the code to teammates.

## Alternatives Considered
### Keep ADR-003 locations
- Rejected: state scattered across `~`, every repo, and agent folders; no single thing to back up.
### Write compiled output directly into agent folders (ADR-001 as written)
- Deferred, not rejected: agents only load skills from their own folders, so compiled output will still need a delivery step (most likely a symlink from the agent folder into `<home>/compiled/`). That step is decided when the compiler is designed.
### Build a sync/backup abstraction now
- Rejected: one adapter (git) means a hypothetical seam. Portable plain files are enough until cloud storage is real.

## Consequences
- One folder to back up, inspect, or delete.
- A delivery mechanism into agent folders must be designed before compiled skills are usable.
- Teams that want shared overrides use the per-project opt-in to keep them in the repo.
