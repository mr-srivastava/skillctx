# ADR-024: Shared operations, a workspace write lock, and applying only the reviewed plan

## Status
Accepted. Refines ADR-022 (how the UI's confirm step applies a plan) and ADR-005 (several surfaces over one core).

## Date
2026-10-03

## Context
skillctx has three surfaces over one core: the CLI, the local web UI and, in Phase 5, an MCP server (ADR-005). Phase 1 gave the UI its first write operations (adopt, deploy, undeploy), which raised three problems.

**Logic drifting into surfaces.** Core exported building blocks, and each surface put them together itself. The UI's file listing and diffing lived in `src/ui/data.ts`, where neither the CLI nor MCP could reach it. The CLI's deployment list combined `readRecord`, `entryState` and `buildDir`, and the inventory tally repeated the same combination. Each new surface would have repeated it again.

**Concurrent writers.** `skillctx ui` runs for as long as it's open; the CLI runs a command at a time; MCP starts whenever a harness needs it. All three can be running at once against one workspace. `applyPlan` reads the deployment record, writes agent folders, then writes the record back, so two overlapping runs could lose an entry from the record. ADR-022 relies on that record being complete: skillctx only touches entries it lists.

**Stale plans.** ADR-022 says deploys are planned, shown, then applied after confirmation. In the CLI, planning and applying happen in one command. In the UI, a plan can sit on screen for minutes while another tool changes the agent folders. `applyPlan` already re-checks every entry and refuses if one changed, but it can't tell whether what it would write is still what the person agreed to.

## Decision

### Shared operations in `src/core/ops/`
- An operation that combines several core modules for a surface lives in `src/core/ops/`: `listDeployments` and `displayPlan` and `applyReviewed` in `deployments.ts`, and the skill copy file listing and diffing in `files.ts`.
- Surfaces parse input and render output. They call core and `core/ops`, and don't put core modules together themselves.
- Core modules may use `core/ops` too (the inventory's deployment tally uses `listDeployments`). Nothing in core imports from `src/cli/` or `src/ui/`.
- Wording that more than one surface prints, such as plan verbs and deployment states, lives in a type-only core module (`core/deploy/labels.ts`), so the browser can import it.

### One workspace write lock
- `withWorkspaceLock(ws, fn)` in `src/core/lock.ts` creates `local/workspace.lock` exclusively and writes the owner's pid into it. The lock is per machine, so it sits in the git-ignored `local/` folder.
- `adopt`, `applyPlan`, `importSkillsManager` (except `--dry-run`) and `refreshInventory` take it. The lock nests within one process, because importing adopts each skill. Calls are matched by the workspace's real path.
- A second writer is refused straight away with `WorkspaceBusyError`, naming the holder's pid and the lock file; it never waits. The CLI prints the message and exits 1; the UI answers 409 and shows it.
- A lock whose pid is no longer running is taken over. A lock with no readable pid counts as busy for five seconds, since its owner may still be writing it, and is taken over after that.
- The lock is never held across network calls. A refresh holds it for the scan and the inventory write, releases it for the upstream check, and takes it again to write the result.

### Apply only the plan that was reviewed
- The UI shows a plan made by `displayPlan` (paths under home as `~/` paths) and, on confirmation, sends that plan back.
- `applyReviewed` plans again under the lock and compares the new plan's operations, blocked agents, warnings, confirmation flag and build hash with what was sent. If they match, it applies the new plan. If not, it writes nothing and returns the new plan, which the UI shows with a note that the folders changed.
- What gets written always comes from the server's own new plan. The plan the browser sends only records what the person agreed to.
- Mutation routes share one guard: POST only, the session token, and a same-origin request (ADR-010's rules for the refresh route, now used by every route that changes something).

## Alternatives Considered

### Separate packages or a plugin system for core
- Pros: a hard boundary the build enforces
- Cons: versioning and build overhead for one repo with one runtime
- Rejected: a folder boundary is enough for now

### Wait for the lock instead of refusing
- Pros: a second command succeeds without a retry
- Cons: a stuck holder hangs every other surface, and an unattended MCP call would wait silently
- Rejected: refusing with the holder's pid is clearer, and writes are short

### Re-check entries only (what `applyPlan` already does)
- Pros: no extra round trip
- Cons: it catches entries that changed, but not a plan whose warnings or blocked agents changed, so the person could approve one thing and get another
- Rejected: comparing whole plans costs one extra planning pass

### Trust the plan the browser sends
- Pros: simplest
- Cons: a page could send operations the planner never produced
- Rejected: the server writes only from its own plan

## Consequences
- MCP (Phase 5) gets the same operations, the same lock and the same refusals without new core code.
- One lock race remains: if two processes find the same abandoned lock at the same moment, one could remove the other's new lock. The window is tiny and involves only skillctx processes on one machine. Releasing is safe: a process removes the lock only while it still holds its own pid.
- An agent calling MCP could confirm a plan without a person seeing it. Whether MCP may apply plans at all is decided with the Phase 5 surface.
- A deploy changes agent folders, but the inventory changes only on the next scan. After an apply, the UI rescans; the CLI doesn't.
