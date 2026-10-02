# skillctx

A local, tool-agnostic skill compiler for coding agents. It reads skills installed by other tools (`npx skills`, `gh skill`, Skills Manager) without modifying them, applies your personal variants and per-project patches, and produces lean, project-scoped skills for Claude Code, Codex and Cursor. All its data lives in one workspace folder you choose and can back up to your own GitHub repo. "skillctx" is a working name.

Status: planning. No code yet.

## Docs

| Doc | Purpose |
| --- | --- |
| [docs/spec.md](docs/spec.md) | Product and architecture spec (v0.4) |
| [docs/research/community-research.md](docs/research/community-research.md) | What the community says about the five problems, and existing tools |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records |
| [docs/reviews/](docs/reviews/) | Architecture review notes (inputs, not decisions) |
| [GLOSSARY.md](GLOSSARY.md) | Domain terms |

## Decisions so far

| ADR | Decision |
| --- | --- |
| [001](docs/decisions/ADR-001-compile-to-native-skill-folders.md) | Compile skills for agents' native folders; CLI/MCP read path on top (amended by 009) |
| [002](docs/decisions/ADR-002-section-ops-for-variants-and-patches.md) | Variants and patches are section operations with five rebase states |
| [003](docs/decisions/ADR-003-three-layer-storage-cascade.md) | Three-layer cascade: upstream → personal → project (locations superseded by 009) |
| [004](docs/decisions/ADR-004-typescript-with-bun-binary.md) | TypeScript, npm + Bun single binary |
| [005](docs/decisions/ADR-005-cli-and-local-web-ui-no-desktop-app.md) | CLI + on-demand local web UI; no desktop app, no daemon (UI moved to Phase 0 by 010) |
| [006](docs/decisions/ADR-006-sqlite-fts5-first.md) | SQLite FTS5 first; embeddings optional |
| [007](docs/decisions/ADR-007-integrate-dont-build-adjacent-categories.md) | Integrate with sync, memory and scanners; don't rebuild them (inventory exception: 010) |
| [008](docs/decisions/ADR-008-local-usefulness-analytics.md) | Local usefulness funnel, harness telemetry, paired evals |
| [009](docs/decisions/ADR-009-workspace-at-user-chosen-home.md) | One workspace at a user-chosen path holds all skillctx data; git-backable |
| [010](docs/decisions/ADR-010-inventory-first-with-local-web-ui.md) | Phase 0 is a read-only cross-source inventory with a local web UI |

## MVP (Phase 0)

`skillctx init --home <path>` creates the workspace. `skillctx inventory` scans every skill source (npx skills, gh skill, Skills Manager, Skillshare, plain folders), dedupes copies by content hash, and writes the results to `<home>/inventory/`. `skillctx inventory --check` compares against upstream on demand. `skillctx ui` shows it all in a local web page. The compile engine comes next; its design is still open.
