# ADR-006: SQLite FTS5 keyword search first; embeddings optional

## Status
Accepted

## Date
2026-10-02

## Context
Section retrieval must work offline with a small binary.

## Decision
Use SQLite FTS5 over section summaries, tags and keywords. Add local embeddings (with rank fusion, as conventions-mcp does) only if the trace lab shows retrieval misses.

## Alternatives Considered
### Local embeddings from day one
- Rejected for now: ~100 MB+ model download, slower cold start, unproven need.
### Hosted embeddings
- Rejected: violates local-first.

## Consequences
- Quality depends on good section summaries and tags generated at index time.
