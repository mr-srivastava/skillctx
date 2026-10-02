# Engine architecture review (notes, not decisions)

Date: 2026-10-02. Reviewed spec v0.3 and ADR-001…008 with six read-only analysis passes, one per candidate. Nothing here is decided. These are inputs for when the compile engine is designed; ADR-009 and ADR-010 moved Phase 0 to an inventory first.

Vocabulary follows the codebase-design glossary: module, interface, implementation, depth, seam, adapter, leverage, locality.

## Candidates and verdicts

| # | Candidate | Verdict after analysis |
| --- | --- | --- |
| 1 | One deterministic Resolution module under the Compiler and the Context engine | Strong, narrowed: no task parameter; selection (retrieve, rank, ground, budget) stays in a separate Context engine |
| 2 | One Overlay stack for variant and patch replay | Strong, narrowed: define stacking semantics; composites are not layers |
| 3 | Consumer adapters per agent | Strong, reshaped: roots-first placement planner plus per-agent descriptors |
| 4 | Thin Source adapters; Indexer owns identity | Strong (now in Phase 0 via ADR-010) |
| 5 | One Event ingestion module; hook-first capture | Strong: hooks give exact file-read data for Claude Code and Cursor; `cli` read mode becomes a fallback |
| 6 | Two agent operations (`context`, `get`) instead of five | Worth exploring: removes overlap and fixes spec contradictions |

## Cross-cutting findings

- **Build manifest.** Map compiled file path + content hash → section ref. Needed by Resolution (files/get parity), placement (stale cleanup), and ingestion (read → section).
- **Determinism.** Everything below the renderers is a pure function of hashed inputs. `lock.json` should also record the hash scheme version and overlay version.
- **Indexer owns identity.** Stable section IDs and section hashes; the overlay needs them for fuzzy/orphaned states, ingestion for mapping.
- **Generated-output marker.** Compiled output carries a marker the Indexer excludes and the planner requires before overwriting.

Converged module map:

```
Source adapters (list dirs + provenance)
   → Indexer (normalized hash, dedupe, section IDs, summaries, FTS)
   → Resolution (deterministic: scope, overlay stack, composites, rules, last-good snapshot)
        ├→ Placement planner + agent descriptors → write plan → scan gate → applier → build manifest
        └→ Context engine (query-time: retrieve, rank, ground, budget) → CLI / MCP: context + get
Signal adapters (hooks, OTLP, our calls, flags) → Ingestion (manifest lookup, dedupe on tool_use_id) → events.db
```

## Candidate details

### 1. Resolution
- Shared by compile and query: lens-tag scope, variant→patch overlay, patch states, last-good fallback, refs/provenance. Query-only: retrieve, rank (usage prior), ground, disclose, budget.
- Reject `resolve(project, task?)`: it hides two contracts. Resolution takes a project and returns resolved sections (post-overlay text, ref, hash, provenance, patch state), the full rule set in deterministic priority, and stale status. Never reads events.db.
- Tests: golden resolved output; determinism; byte parity between a `files` section file and `get`.
- Open: `get` patched by default with `--raw`? Read path resolves live or from last build? Is section merging part of Resolution or rendering? Compile-time rule choice by pins or explicit priority?

### 2. Overlay stack
- The spec already shares one op format; the gap is stacking. Stacked rebase needs a sixth outcome, **blocked** (cause: lower-layer op), halting at the first conflict; orphans inherit cause; redundancy is judged against the layer below; edits to a lower layer also trigger rebase; the project's policy governs the whole stack.
- Interface: sectioned base + ordered layers (ops + base fingerprint) + fuzzy threshold → result + hash + per-(layer, op) states with causes. Pure, deterministic; `apply(b, [])` = b. Anchor matching twice = conflict.
- Composite = list of section refs each resolved through its own stack, plus an optional single-base layer.
- Gaps: 3-way review needs old upstream text but upstream is never copied; `keep` as a whitelist silently drops new upstream sections.
- Open: `keep` whitelist semantics; where old text is cached; whether a patch can target a composite; overlap of lens scope and variant keep/drop.

### 3. Placement (consumer adapters)
- Verified agent facts (2026-10): Claude Code reads `.claude/skills` (personal beats project on name clash; ~1% listing budget). Codex reads `.agents/skills` (+ `~/.agents/skills`; `hooks.json` SessionStart). Cursor reads `.agents/skills`, `.cursor/skills`, **and** `.claude/skills`, `.codex/skills`. Gemini CLI reads `.gemini/skills` and `.agents/skills`.
- Consequence: the unit of writing is the skill root, not the agent. Writing both `.claude/skills` and `.agents/skills` shows Cursor every skill twice. Plan jointly across agents: fewest roots, each skill once per root, budget/duplicate checks per agent against what it can see.
- Interface: resolved skills + selected agents + root snapshots + previous manifest → pure write plan (writes, deletes, hooks, diagnostics); a separate applier performs it atomically. Never touch files without our marker. Scan is a gate between plan and apply.
- Open: which roots by default; ever write to user-level roots; disable originals via agent config or rename only.

### 4. Sources and Indexer
- On this machine: `~/.claude/skills/*` are symlinks into `~/.agents/skills/*` (npx skills lock at `~/.agents/.skill-lock.json`, v3 with `skillFolderHash`). Skills Manager keeps byte-identical copies in `~/.skills-manager/skills/` with a nested metadata folder to skip. Noise folders: `.trash/`, `.cowork-export/`.
- Dedupe: realpath first, then normalized content hash (sorted paths + bytes, provenance frontmatter keys stripped). The Indexer keeps one skill with all instances; choosing a primary is a later concern.
- Errors become per-skill diagnostics; one bad skill never aborts a scan. Summaries by deterministic heuristics; any LLM enrichment is optional and cached.

### 5. Ingestion
- Claude Code hooks pass `tool_name`, `tool_use_id`, `tool_input.file_path`; OTel `claude_code.tool_result` carries `file_path`, `OTEL_LOG_TOOL_DETAILS=1` is real. Cursor `beforeReadFile` gets path and content (drop content). Codex hooks see shell commands, so read mapping is heuristic.
- Hooks are enough for `files` mode analytics without a collector; an OTLP collector conflicts with "nothing runs in the background" and should be opt-in via `watch`.
- Dedupe on (agent, session, tool_use_id, kind). Drop anything outside compiled folders before persisting.

### 6. Agent operations
- `search` is `context` with a small budget and no anchors; delete it from the agent interface. `verify` survives as a human command and publish check; `propose` waits for Phase 3 evidence.
- Spec contradictions found: §10 put `context` in Phase 3 while §6 told Phase 2 agents to call it; §5 says five MCP tools while §12 claims the two-tool design.

## Phase 0 code to revisit when the engine starts

Added 2026-10-02, after a codebase-design pass over the inventory code (the other findings from that pass are done: refreshInventory, ADR-014, the provenance kinds table, shared file listing).

- **`buildIndex` reads files while it groups.** `readCopy` in `src/core/indexer/index.ts` parses and hashes from disk inside the grouping step. That's fine for the inventory. The engine will want to index resolved text that isn't on disk (post-overlay sections) and to assign section IDs, so split it into reading (folder → parsed copy) and a pure grouping step over parsed copies. Do this when section IDs are designed, not before: only one caller exists today.
- **The engine's reader of the inventory is `InventoryReader`** (`src/core/inventory/store.ts`). Section IDs and section hashes are added fields under ADR-014, so they don't bump the format.
- **New core operations follow `refreshInventory`.** `build`, `context` and `get` should each be one core function the CLI, the UI and MCP call, with the network and the clock injected.

## Proposed ADR numbering when the engine is designed

Resolution; stacked overlay semantics and composites; placement planner over shared roots; hook-first read capture with `cli` mode as fallback (supersedes a consequence in ADR-001); two agent operations. Number them after the current last ADR.
