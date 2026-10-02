# ADR-003: Three-layer cascade and where each layer lives

## Status
Accepted

## Date
2026-10-02

## Context
Some customizations apply everywhere (personal style), others only to one repo (this repo uses Zod). Teammates must get identical builds.

## Decision
Upstream (read-only, pinned by hash) → personal variants in `~/.skillctx/store/` (its own git repo) → project patches and lens in `<repo>/.skillctx/` (committed). `lock.json` pins upstream and variant hashes. Indexes and events live in rebuildable local SQLite.

## Alternatives Considered
### Everything per project
- Rejected: personal patterns get re-created in every repo.
### Everything in one personal store
- Rejected: repo-specific facts wouldn't reach teammates.

## Consequences
- Build output depends on a personal store; teams must decide whether shared variants live in the repo (open question).
