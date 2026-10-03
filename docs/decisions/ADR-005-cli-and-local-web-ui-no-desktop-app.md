# ADR-005: CLI plus on-demand local web UI; no desktop app, no daemon

## Status
Accepted. Amended by ADR-010: the local web UI ships in Phase 0 as the inventory view. Under ADR-021 skillctx competes with Skills Manager on management features; the decision (CLI plus local web UI, no desktop app) stands, but "competes with an incumbent" is no longer a reason for it.

## Date
2026-10-02

## Context
Users live in the terminal and in agents. The UI is needed occasionally (diff review, analytics). xingkongliang/skills-manager already owns the desktop experience.

## Decision
A short-lived CLI; MCP as a stdio process started by the harness; `skillctx ui` serves a local web dashboard only while open; optional `skillctx watch`.

## Alternatives Considered
### Desktop app (Tauri/Electron)
- Rejected: signing, updaters, per-OS builds for rarely used screens; competes with an incumbent.
### Background daemon
- Rejected: nothing requires always-on state; SQLite + stateless calls suffice.

## Consequences
- Dashboard needs loopback-only binding and a mutation token (see udayvarmora07/skills-manager ADR-001).
