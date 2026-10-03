# ADR-022: Deploying skills into agent folders

## Status
Accepted. Amends ADR-001 and ADR-009: how skills reach agent folders is decided here, for managed skills now and for compiled skills later.

## Date
2026-10-03

## Context
Agents load skills only from their own folders (`~/.claude/skills`, `~/.agents/skills`, and others). Under ADR-021, skillctx deploys skills from its library into those folders. Until now it never wrote outside its workspace: `Workspace.write` in `src/core/workspace.ts` refuses any other path, and a test enforces that.

These folders are shared. `npx skills`, `gh skill`, Skills Manager and the user also write there. Agents also read more than one folder: Cursor reads `.agents/skills`, `.cursor/skills`, `.claude/skills` and `.codex/skills`, so the same skill in two of them shows up twice (docs/reviews/2026-10-02-engine-architecture-review.md, candidate 3).

## Decision
- **Two writers.** `Workspace.write` keeps refusing paths outside the workspace. A separate agent-folder writer can write only inside known skill folders and only to entries in the deployment record.
- **Deployment record.** Every link or copy skillctx creates is recorded with its folder, entry name, mode and content hash. The record holds absolute paths, so it lives in the workspace's git-ignored per-machine file (ADR-009). skillctx never modifies or deletes an entry that isn't in the record.
- **Plan, then apply.** Deploy, undeploy and update first compute a plan (create link, replace copy, remove) and show it. The CLI has `--dry-run`; the UI asks for confirmation. A separate step applies the plan.
- **Symlink by default, copy as an option.** Links point at built output in `<home>/build/`, which is git-ignored but separate from `.cache/`, so clearing the cache never breaks an agent.
- **Entries skillctx didn't create.** If a target already exists and isn't in the record, the plan stops with a conflict and offers to adopt that skill first. After adopting, replacing the entry needs an explicit confirmation.
- **Agents in the UI, folders in the plan.** You choose agents, as in Skills Manager. The planner picks the fewest folders that reach those agents, puts each skill in a folder at most once, and warns when an agent would see a skill twice.
- **Undo.** Undeploying removes only what the record says skillctx created.

## Alternatives Considered

### Write anywhere in agent folders
- Pros: simplest
- Cons: can overwrite skills other tools installed
- Rejected: the record is what makes undo and coexistence safe

### Replace foreign entries after backing them up into the workspace
- Pros: smoothest deploy
- Cons: moves files other tools own; their lockfiles then point at nothing
- Rejected: adopting first leaves the original in place until you confirm

### One folder per agent, as Skills Manager does
- Pros: matches what users expect
- Cons: Cursor and others see duplicates
- Rejected: users still pick agents; the planner hides the folder detail

### Links into `.cache/`
- Pros: no new folder
- Cons: `.cache/` is documented as safe to delete
- Rejected: deleting it would break every deployed skill

## Consequences
- A test must show the agent-folder writer refuses entries that aren't in the record, as the workspace writer's test does for outside paths.
- The workspace gains `build/` and a git-ignored deployment record.
- Symlinks into `<home>/build/` break if the workspace moves; re-running deploy fixes them. Copy mode avoids this.
- Compiled skills (Phase 5) use the same planner and writer.
