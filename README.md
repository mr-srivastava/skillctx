# skillctx

A local, tool-agnostic skill compiler for coding agents. It reads skills installed by other tools (`npx skills`, `gh skill`, Skills Manager) without modifying them, applies your personal variants and per-project patches, and writes lean, project-scoped skills into the folders Claude Code, Codex and Cursor already read. "skillctx" is a working name.

Status: planning. No code yet.

## Docs

| Doc | Purpose |
| --- | --- |
| [docs/spec.md](docs/spec.md) | Product and architecture spec (v0.3) |
| [docs/research/community-research.md](docs/research/community-research.md) | What the community says about the five problems, and existing tools |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records |

## Decisions so far

| ADR | Decision |
| --- | --- |
| [001](docs/decisions/ADR-001-compile-to-native-skill-folders.md) | Compile into agents' native skill folders; CLI/MCP read path on top |
| [002](docs/decisions/ADR-002-section-ops-for-variants-and-patches.md) | Variants and patches are section operations with five rebase states |
| [003](docs/decisions/ADR-003-three-layer-storage-cascade.md) | Upstream → personal store (git) → project `.skillctx/` |
| [004](docs/decisions/ADR-004-typescript-with-bun-binary.md) | TypeScript, npm + Bun single binary |
| [005](docs/decisions/ADR-005-cli-and-local-web-ui-no-desktop-app.md) | CLI + on-demand local web UI; no desktop app, no daemon |
| [006](docs/decisions/ADR-006-sqlite-fts5-first.md) | SQLite FTS5 first; embeddings optional |
| [007](docs/decisions/ADR-007-integrate-dont-build-adjacent-categories.md) | Integrate with sync, memory and scanners; don't rebuild them |
| [008](docs/decisions/ADR-008-local-usefulness-analytics.md) | Local usefulness funnel, harness telemetry, paired evals |

## MVP (Phase 0)

Read installed skills → split into sections → apply the project lens → `skillctx build` lean skills into `.claude/skills/` and `.agents/skills/`. Gate: compiled skills match or beat the originals in paired runs, with fewer tokens.
