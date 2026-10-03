# ADR-010: Start with a read-only skill inventory and local web UI

## Status
Superseded by ADR-021 for scope: installing, updating, deploying and syncing are no longer non-goals. Phase 0 as described here is built and remains the inventory that later phases use. Two items listed below were not built: the Skillshare adapter (spec §11) and an outdated check from Skills Manager's remote revision.

## Date
2026-10-02

## Context
The compile engine (resolution, overlays, placement into agents) still has open design questions; see `docs/reviews/2026-10-02-engine-architecture-review.md`. The user wants to start building something useful now while keeping that engine open. Scanning every skill source, deduplicating by content hash and tracking upstream versions is required by the compiler anyway (the source adapter and Indexer work rated Strong in the review).

ADR-007 said not to build inventory or dashboards because Skills Manager and Skillshare already do. Our inventory differs in scope: it is read-only, spans all sources at once, and is the foundation the compiler builds on.

## Decision
Phase 0 is an inventory:
- Source adapters for `npx skills` (lockfile + `.agents/skills`), `gh skill` (frontmatter provenance), Skills Manager (`~/.skills-manager`), Skillshare, and plain folders. Adapters only enumerate skill folders and provenance.
- An Indexer that resolves symlinks, hashes normalized folder content, groups instances of the same skill, and records per-source provenance.
- An outdated check against upstream (lockfile source URLs and hashes, gh repo/ref/tree SHA, Skills Manager remote revision). It runs only on explicit refresh (`skillctx inventory --check` or the UI refresh button), never in the background.
- Results written to `<home>/inventory/` (ADR-009) as plain files.
- A local web UI (`skillctx ui`, loopback only) showing skills, where each is installed, duplicates and drift between copies, and outdated status.

Still non-goals: installing, updating, deploying, or syncing skills into agent folders. The inventory never writes to upstream or agent folders.

## Alternatives Considered
### Build the compiler first (spec v0.3 Phase 0)
- Rejected for now: too many open engine decisions; no usable output until they're settled.
### Rely on Skills Manager for inventory
- Rejected: covers only its own library and a desktop UI; we need a cross-source index we control as the compiler's input.

## Consequences
- Usable tool early; real data from the user's machine informs engine design.
- Overlaps Skills Manager's library view; we stay read-only to avoid competing on install/deploy/sync.
- Network access is needed for outdated checks, on demand only.
