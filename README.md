# skillctx

A local, tool-agnostic skill compiler for coding agents. It reads skills installed by other tools (`npx skills`, `gh skill`, Skills Manager) without modifying them, applies your personal variants and per-project patches, and produces lean, project-scoped skills for Claude Code, Codex and Cursor. All its data lives in one workspace folder you choose and can back up to your own GitHub repo. "skillctx" is a working name.

Status: Phase 0 (read-only inventory and local web UI) works. The compile engine is not designed yet.

## Docs

| Doc | Purpose |
| --- | --- |
| [docs/spec.md](docs/spec.md) | Product and architecture spec (v0.5) |
| [docs/research/community-research.md](docs/research/community-research.md) | What the community says about the five problems, and existing tools |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records |
| [docs/reviews/](docs/reviews/) | Architecture review notes (inputs, not decisions) |
| [GLOSSARY.md](GLOSSARY.md) | Domain terms |

## Decisions so far

| ADR | Decision |
| --- | --- |
| [001](docs/decisions/ADR-001-compile-to-native-skill-folders.md) | Compile skills for agents' native folders; CLI/MCP read path on top (amended by 009) |
| [002](docs/decisions/ADR-002-section-ops-for-variants-and-patches.md) | Variants and patches are section operations with five rebase states |
| [003](docs/decisions/ADR-003-three-layer-storage-cascade.md) | Three-layer cascade: upstream → personal → project (locations superseded by 009) |
| [004](docs/decisions/ADR-004-typescript-with-bun-binary.md) | TypeScript, npm + Bun single binary |
| [005](docs/decisions/ADR-005-cli-and-local-web-ui-no-desktop-app.md) | CLI + on-demand local web UI; no desktop app, no daemon (UI moved to Phase 0 by 010) |
| [006](docs/decisions/ADR-006-sqlite-fts5-first.md) | SQLite FTS5 first; embeddings optional |
| [007](docs/decisions/ADR-007-integrate-dont-build-adjacent-categories.md) | Integrate with sync, memory and scanners; don't rebuild them (inventory exception: 010) |
| [008](docs/decisions/ADR-008-local-usefulness-analytics.md) | Local usefulness funnel, harness telemetry, paired evals |
| [009](docs/decisions/ADR-009-workspace-at-user-chosen-home.md) | One workspace at a user-chosen path holds all skillctx data; git-backable |
| [010](docs/decisions/ADR-010-inventory-first-with-local-web-ui.md) | Phase 0 is a read-only cross-source inventory with a local web UI |
| [011](docs/decisions/ADR-011-tailwind-for-the-web-ui.md) | Tailwind CSS v4 for the web UI, via Bun's plugin |

## Usage

Requires [Bun](https://bun.sh) 1.3 or later.

```bash
bun install
bun run build            # writes dist/skillctx, a single binary
```

```bash
skillctx init --home ~/skillctx   # create a workspace and make it active
skillctx inventory                # scan every skill folder, write <home>/inventory/
skillctx inventory --check        # also compare with GitHub and git remotes
skillctx ui                       # open the inventory at http://127.0.0.1:4317
```

During development, use `bun run dev <command>` instead of the binary.

`inventory` reads skill folders for Agents (`~/.agents/skills`), Claude Code, Codex, Cursor, Gemini, OpenCode, Skills Manager and Claude plugins. It never writes to them. Provenance comes from the `npx skills`/`gh skill` lockfile, `gh skill` frontmatter, git checkouts, the Skills Manager database and Claude's plugin list. Only `--check` (or "Check for updates" in the UI) touches the network: one GitHub request per repository, using `GITHUB_TOKEN` or `gh auth token` if available.

Point at a different workspace with `--home <path>` or `SKILLCTX_HOME`. The active workspace is recorded in `~/.config/skillctx/config.json`.

### The workspace

```
<home>/
  skillctx.yaml        # workspace settings
  inventory/           # one JSON file per skill, plus summary.json and upstream.json
  .cache/              # rebuildable, git-ignored
```

Every path stored in the workspace is relative to `~`, so you can commit it to a private GitHub repo and use it on another machine.

## Development

| Command | Does |
| --- | --- |
| `bun test` | Run tests |
| `bun run lint` | Biome |
| `bun run typecheck` | tsc |
| `bun run build` | Compile and ad-hoc sign `dist/skillctx` |

The UI server builds the client bundle at startup, so restart `skillctx ui` after editing `src/ui/client/`. Styles use Tailwind v4; theme tokens are in `src/ui/client/styles.css` (ADR-011).
