# CLAUDE.md

Project: skillctx, a skill compiler for coding agents. Planning stage.

- Read `docs/spec.md` before designing or building anything. Router for details:
  - Why a choice was made → `docs/decisions/ADR-*.md`. Don't re-decide an accepted ADR; propose a new ADR that supersedes it.
  - Market and community evidence → `docs/research/community-research.md`.
- New significant decisions get an ADR in `docs/decisions/`, continuing the `ADR-NNN-kebab-title.md` sequence with sections Status, Date, Context, Decision, Alternatives Considered, Consequences.
- Keep `docs/spec.md` in sync when a decision changes it; bump its version line.
- Invariants: upstream skills are read-only; local-first (nothing leaves the machine unless the user pushes their workspace or runs an explicit outdated check); tool-agnostic (CLI and plain files first, MCP on top).
- The live collaborative copy of the spec is a Claude Doc (link in `docs/spec.md`); the repo copy is the source of truth for development.
- Current focus is Phase 0: a read-only skill inventory and local web UI (ADR-010), with all data in a user-chosen workspace (ADR-009). The compile engine is not designed yet; `docs/reviews/` holds notes for it, not decisions.
- Domain terms are in `GLOSSARY.md`; add a term there when a new concept gets a name.
