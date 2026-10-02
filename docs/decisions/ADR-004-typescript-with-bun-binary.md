# ADR-004: TypeScript, shipped via npm and as a Bun single binary

## Status
Accepted

## Date
2026-10-02

## Context
Target users install skills with `npx skills`. The workload is file IO, SQLite and markdown processing, not CPU-heavy. We need an MCP server and a local web UI.

## Decision
TypeScript. Publish to npm (`npx skillctx`) and also ship a single binary via `bun build --compile`.

## Alternatives Considered
### Rust
- Pros: fastest, single binary, native tree-sitter.
- Rejected: slower iteration; speed buys little for this workload; separate frontend stack anyway.
### Go
- Pros: single binary.
- Rejected: weaker markdown (remark/unified) and MCP SDK ecosystem than TS.

## Consequences
- Same language for CLI, MCP server and dashboard.
- Node startup (~100 ms) per CLI call; mitigated by the Bun binary.
