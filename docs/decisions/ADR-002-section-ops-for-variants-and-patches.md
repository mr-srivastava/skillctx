# ADR-002: Represent variants and patches as section operations

## Status
Accepted. Amended by ADR-021: edits are first stored as line diffs against an immutable snapshot and merged 3-way on update (Phase 2). Section ops replace diffs as the main format when the section parser exists (Phase 5); the raw-diff op below is that first format.

## Date
2026-10-02

## Context
Users want to customize upstream skills and keep receiving updates. Today edits are overwritten or freeze updates (Hermes #16852, mattpocock/skills #196).

## Decision
Variants and project patches are YAML lists of operations on named sections: `keep`, `drop`, `replace` (with anchor text), `append`, plus a raw-diff escape hatch. On upstream change, ops are replayed and land in one of five states: clean, fuzzy, conflict, redundant, orphaned. Conflicts stop and keep serving the last good build.

## Alternatives Considered
### Full copies
- Rejected: miss every upstream change outside the edit.
### Unified line diffs
- Rejected: break when upstream reflows paragraphs or reorders lists.
### LLM-applied semantic patches (agent-patch style)
- Rejected for application: non-deterministic and not reviewable. Used only to draft conflict fixes.

## Consequences
- Requires a reliable markdown section parser.
- Upstream heading restructures produce conflicts; a 3-way review UI is needed.
- `skillctx check` can gate CI on stale patches.
