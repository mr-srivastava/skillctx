# ADR-014: A versioned inventory format, owned by one core module

## Status
Accepted

## Date
2026-10-02

## Context
`skillctx inventory` writes `<home>/inventory/`: one JSON file per skill, `summary.json`, and `upstream.json` after a check. Users commit the workspace and push it to their own repo (ADR-009), so these files outlive the binary that wrote them. A workspace might be read by an older or newer skillctx on another machine.

The format was implicit. The record type was `ReturnType<typeof toRecord>`. `core/inventory.ts` wrote the files, and `ui/data.ts` read them back with unchecked casts. No file said which format it used. The compile engine will be the third reader, and it shouldn't depend on code under `ui/`.

## Decision
- **One module owns the format.** `src/core/inventory/format.ts` declares the committed types (`SkillRecord`, `CopyRecord`, `InventorySummary`), the file paths, and `toRecord`. `src/core/inventory/store.ts` holds both sides: `writeInventory`, `writeUpstream` and `InventoryReader`. Nothing else reads or writes `inventory/`.
- **Every file carries `"format": <n>`** as its first key. The format is currently 1. The reader removes the key, so callers never see it.
- **Versioning policy:**
  - Adding a field doesn't change the format. Readers ignore fields they don't know.
  - Bump `INVENTORY_FORMAT` only when an older reader would misread a file: a field renamed, removed, or changed in meaning or type.
  - A file without `format` predates this ADR and is read as format 1, because its shape is identical.
  - A reader that finds a newer format throws `InventoryFormatError` instead of guessing. The CLI exits 1 with "Upgrade skillctx", and the UI shows the same message.
  - A writer refuses to overwrite an inventory whose `summary.json` has a newer format, so an old binary can't silently downgrade a workspace.
- **Records are still not validated field by field.** The format number protects against version skew. It doesn't protect against hand-edited files, which still read as best-effort.

## Alternatives Considered

### One `inventory/format.json` for the whole folder
- Pros: no extra key in every file; one place to check
- Cons: a file copied between workspaces carries no version; one file can say one thing while the records say another
- Rejected: each file should describe itself, and the cost is one line per file

### Validate every record with a schema library (Zod or similar)
- Pros: catches hand edits and partial writes
- Cons: a new runtime dependency, and a schema that duplicates the TypeScript types
- Rejected for now: the risk we have is version skew, which the format number covers. Revisit when users start editing the inventory by hand, which Phase 0 doesn't expect

### Keep the reader in the UI
- Pros: no change
- Cons: the compiler and a future MCP server would import from `ui/`, or duplicate the reader
- Rejected: reading and writing one format belong in one place

## Consequences
- Every committed inventory file gains a `"format": 1` line, which shows up as a one-time diff for anyone who has already committed a workspace.
- The client imports the record types from `core/inventory/format.ts` (type-only), not from `ui/data.ts`.
- When the engine adds section IDs to records (engine review notes, "Indexer owns identity"), that's an added field and doesn't change the format. Changing how `hash` is computed already has its own version prefix (`h2:`).
