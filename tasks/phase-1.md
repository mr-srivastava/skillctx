# Phase 1: adopt and deploy

Current plan. Governing decisions: ADR-021 (direction), ADR-022 (deploying), ADR-023 (formats, takeover). Spec §3, §4 and §10. Commands: `bun run test`, `bun run lint`, `bun run typecheck`.

Gate: the author manages their own machine's skills through skillctx, with no writes outside the deployment record.

## Decisions for this phase (2026-10-03)

- Taking over another tool's entry: take over after confirmation, record it, detect when the tool takes it back, never fight. Only symlinks can be taken over; real folders are blocked (ADR-023).
- Agents: the folders the inventory already reads, except Skills Manager's library, which stays a source.
- Skills Manager import: its library now; presets and tags stored in the lockfile for Phase 3.
- Commands are top-level verbs: `adopt`, `deploy`, `undeploy`, `import`.

## Architecture

- New core modules, none of which know about the CLI or UI:
  - `src/core/library/`: lockfile format and store, snapshot and build folders, `adopt`.
  - `src/core/deploy/`: agent table, pure planner, deployment record, guarded writer, `applyPlan`.
- Each operation is one core function the CLI and UI both call, like `refreshInventory`, with the clock injected.
- `Workspace` keeps refusing paths outside the workspace. Only `src/core/deploy/writer.ts` writes into agent folders, and only to entries the record owns or the plan has been confirmed to take over.
- The planner is a pure function of (skill, agents, mode, record, a snapshot of the agent folders). Everything that touches the disk is outside it, so it can be tested exhaustively with plain data.

## Agent table

Which user-level folders each agent reads (engine review, candidate 3, verified 2026-10; entries marked "assumed" need checking on a real install before relying on them):

| Agent | Folders, preferred first |
| --- | --- |
| Claude Code | `~/.claude/skills` |
| Codex | `~/.agents/skills`, `~/.codex/skills` (assumed: legacy folder npx skills still links into) |
| Cursor | `~/.cursor/skills`, `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills` |
| Gemini CLI | `~/.gemini/skills`, `~/.agents/skills` |
| OpenCode | `~/.config/opencode/skills` (assumed: only this folder) |

## Tasks

### 1. Workspace layout for the library
- [x] `LAYOUT` gains `library`, `build`, `local`; `.gitignore` gains `build/`, `library/fetched/`, `local/`
- [x] `ensureLayout(ws)` adds missing folders and ignore lines to existing workspaces; idempotent; `init` uses it
- [x] Tests: new workspace; pre-Phase-1 workspace gets the lines once; running twice changes nothing

### 2. Lockfile format and store
- [x] `src/core/library/format.ts`: `LIBRARY_FORMAT = 1`, `LockEntry`, `Lockfile`, paths, `snapshotDir`, `buildDir`
- [x] `src/core/library/store.ts`: read and write `library/lock.json` with `format` first and sorted keys; refuse newer formats (`LibraryFormatError`)
- [x] Tests: round trip; stable bytes; newer format refused for read and write

### 3. Adopt
- [x] `adopt(ws, homeDir, { name, copy?, now })` reads the inventory record, picks the main copy (most locations) unless `copy` is given, re-hashes the source, and refuses if it changed since the scan
- [x] Copies exactly `listSkillFiles` into `library/snapshots/<name>` or `library/fetched/<name>` (refetchable = has an upstream and is unchanged since install), then materializes `build/<name>`
- [x] Adopting the same hash again is a no-op; a different hash for an adopted name is refused ("update arrives in Phase 2")
- [x] Never writes outside the workspace (existing guard)
- [x] Tests: snapshot bytes and hash match; refetchable vs committed placement; drifted skill needs `--copy` or takes the main copy; source edited after scan is refused

### 4. Deployment record and ownership
- [x] `src/core/deploy/record.ts`: read and write `local/deployments.json` (versioned)
- [x] `entryState(entry, record, ws)`: `missing`, `ours`, `taken-back`, `foreign-link`, `foreign-folder`
- [x] Tests for each state, including a copy-mode entry whose content changed

### 5. Planner
- [x] `src/core/deploy/agents.ts`: the agent table above, as data
- [x] `plan({ skill, agents, mode, record, folders })` picks the fewest folders reaching the agents (ties: preferred order, fewest unchosen agents exposed, fewest takeovers), then per folder: create, keep, replace-link (takeover), blocked (foreign real folder or taken back); removes this skill's recorded entries in folders no longer chosen
- [x] Warnings: an agent that would see the skill in two folders; unchosen agents that will also see it
- [x] Tests over plain data: each state, set cover choices, duplicate warnings, undeploy plans

### 6. Writer and apply
- [x] `src/core/deploy/writer.ts`: create symlink or copy, replace a foreign link (recording its old target), remove an owned entry, restore a replaced link. Refuses any path not inside a known agent folder, and any entry the record doesn't own unless the op is a confirmed takeover
- [x] `applyPlan(ws, plan, { confirmTakeover, now })` re-checks every entry's state before writing (the disk may have changed since planning), then updates the record
- [x] Tests in a temp HOME: deploy, redeploy is a no-op, takeover then undeploy restores the old link, writer refuses an unowned entry, taken-back entry is left alone

### 7. CLI
- [x] `skillctx adopt <skill> [--copy N]`
- [x] `skillctx deploy <skill> --agent claude,codex,... [--copy-mode] [--replace] [--dry-run]` prints the plan; applies unless `--dry-run`; takeovers need `--replace`
- [x] `skillctx deploy` with no skill lists deployments and their state (ours, taken back, missing)
- [x] `skillctx undeploy <skill> [--dry-run]`
- [x] Tests through `main()` with a temp HOME, like `test/inventory.test.ts`

### 8. Inventory awareness
- [x] Provenance kind `skillctx` for copies whose real path is under `<home>/build/`, or recorded copy-mode entries
- [x] Scan summary counts taken-back deployments; `inventory` prints them

### 9. Import from Skills Manager
- [x] `skillctx import skills-manager [--dry-run]` adopts every skill in `~/.skills-manager/skills` (read-only on its side) and stores its presets and tags in the lockfile
- [x] Fixture database test, like the existing Skills Manager provenance test

### 10. UI
- [ ] Token-protected mutation routes for adopt, plan, apply and undeploy (ADR-020 mutation pattern)
- [ ] Skill page: Adopt button; Deploy panel with agent toggles, the plan, warnings, and a confirm step; deployments listed with their state
- [ ] Library filter: managed skills

### Checkpoint: real machine
- [ ] Adopt and deploy a handful of the author's skills; undeploy restores the old links; `git status` in the workspace shows only `library/` changes
- [ ] Review with the user before Phase 2 planning
