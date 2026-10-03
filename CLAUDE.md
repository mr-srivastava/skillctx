# CLAUDE.md

Project: skillctx, a local skill manager for coding agents. Install, deploy and edit skills without losing upstream updates, see where every skill came from and whether it's used, and later compile project-specific skills (ADR-021).

- Read `docs/spec.md` before designing or building anything. Router for details:
  - Why a choice was made → `docs/decisions/ADR-*.md`. Read the Status line first: several early ADRs are superseded or amended. Don't re-decide an accepted ADR; propose a new ADR that supersedes it.
  - Market and community evidence → `docs/research/community-research.md`.
- New significant decisions get an ADR in `docs/decisions/`, continuing the `ADR-NNN-kebab-title.md` sequence with sections Status, Date, Context, Decision, Alternatives Considered, Consequences.
- Keep `docs/spec.md` in sync when a decision changes it; bump its version line. The repo copy is the only spec.
- Invariants:
  - Snapshots are immutable; edits are stored as diffs on top. Skills installed by other tools are never modified, only adopted.
  - skillctx writes outside its workspace only into agent skill folders, only to entries in its deployment record or foreign symlinks you confirmed it may take over, and only after showing a plan (ADR-022, ADR-023). It never removes another tool's real folder.
  - Local-first: network only on explicit actions (install, check for updates, restore, browse skills.sh, push). No account, no server, no telemetry.
  - Tool-agnostic: CLI and plain files first, local web UI and MCP on top.
- Parity with Skills Manager (xingkongliang/skills-manager) means its users can switch without missing anything day to day. Build each parity feature on skillctx's model (snapshot → diff → build → deployment), not by copying Skills Manager's mutable library. udayvarmora07/skills-manager is a different project; the spec borrows only its vocabulary.
- Phase 0 (read-only inventory and web UI) is built. Phase 1, adopt and deploy, is in progress: `tasks/phase-1.md` is the current plan. `tasks/plan.md` and `tasks/todo.md` are the historical Phase 0 record. `docs/reviews/` holds notes for the compile engine (Phase 5), not decisions.
- Domain terms are in `GLOSSARY.md`; add a term there when a new concept gets a name.
