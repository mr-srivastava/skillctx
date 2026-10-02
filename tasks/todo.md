# Phase 0 tasks: skill inventory

Plan: `tasks/plan.md`. Commands assume Bun: `bun test`, `bun run build`, `bun run lint`.

## Foundation

### Task 1: Project scaffold
**Description:** Bun + TypeScript project with test, lint and build scripts, and a CLI entry that prints its version.

**Acceptance criteria:**
- [x] `bun run src/cli/index.ts --version` prints the package version
- [x] `bun test` runs a passing smoke test
- [x] `bun run build` produces a single binary via `bun build --compile`

**Verification:** tests pass; build succeeds; binary runs `--version`.
**Dependencies:** None
**Files:** `package.json`, `tsconfig.json`, `biome.json`, `src/cli/index.ts`, `test/smoke.test.ts`
**Scope:** S

### Task 2: Workspace init
**Description:** `skillctx init --home <path>` creates the ADR-009 layout, writes `skillctx.yaml` and `.gitignore` (`.cache/`, `local.yaml`), and records the pointer in `~/.config/skillctx/config.json`. Includes the path helper (absolute ↔ `~`-relative) and the write guard that refuses paths outside `<home>`.

**Acceptance criteria:**
- [x] Creates `inventory/`, `variants/`, `profiles/`, `projects/`, `compiled/`, `.cache/` and config files; running it twice changes nothing
- [x] Refuses a non-empty folder that isn't already a workspace, with a clear message
- [x] Write guard throws on any path outside `<home>`; covered by a test

**Verification:** tests pass using a temp HOME; manual: `init --home /tmp/sk-test` then inspect the tree.
**Dependencies:** 1
**Files:** `src/core/workspace.ts`, `src/core/paths.ts`, `src/cli/commands/init.ts`, `test/workspace.test.ts`
**Scope:** M

## Checkpoint A
- [x] Tests and lint pass; binary builds
- [x] `init` works against a temp HOME

## Local inventory

### Task 3: Root discovery and plain-folder source
**Description:** A table of known skill roots (`~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/skills`, `~/.config/opencode/skills`, plus extra roots from `skillctx.yaml`). The plain-folder source lists every folder containing `SKILL.md`, following symlinks, skipping `.trash/`, `.cowork-export/`, `.skills-manager/`, `.git/`, `node_modules/`.

**Acceptance criteria:**
- [x] `list()` returns `{root, entryPath, realPath, sourceId}` per skill folder
- [x] Symlink loops terminate; missing roots are skipped silently
- [x] Fixture with a canonical root plus two symlinked agent roots returns all entries with correct realpaths

**Verification:** fixture tests pass.
**Dependencies:** 2
**Files:** `src/core/sources/roots.ts`, `src/core/sources/plain.ts`, `test/fixtures/sources/plain/**`, `test/sources/plain.test.ts`
**Scope:** M

### Task 4: Indexer: parse, hash, group, drift
**Description:** Parse `SKILL.md` frontmatter (name, description). Compute the normalized content hash (`h1:`, sorted paths + bytes, provenance keys stripped). Group instances by realpath, then by hash, into skills. Flag drift (same name, different hash). Per-skill diagnostics for malformed files; one bad skill never stops the scan.

**Acceptance criteria:**
- [x] One skill visible through three roots becomes one skill with three instances
- [x] Same content at two realpaths (a byte copy) groups into one skill; edited copy is reported as drift
- [x] Malformed frontmatter yields a diagnostic, not an exception

**Verification:** fixture tests pass; hashing is deterministic across runs.
**Dependencies:** 3
**Files:** `src/core/indexer/parse.ts`, `src/core/indexer/hash.ts`, `src/core/indexer/index.ts`, `test/indexer.test.ts`
**Scope:** M

### Task 5: `skillctx inventory` writes inventory files
**Description:** Run sources and Indexer, write `<home>/inventory/skills/<name>.json` and `summary.json` with stable ordering and `~`-relative paths, remove files for skills that disappeared, print a terminal summary (skills, instances, drift, diagnostics).

**Acceptance criteria:**
- [x] Second run with no changes leaves `git status` clean in the workspace
- [x] No inventory file contains the absolute home path
- [x] Terminal summary shows counts per root

**Verification:** tests pass; manual run on the author's machine.
**Dependencies:** 4
**Files:** `src/core/inventory.ts`, `src/cli/commands/inventory.ts`, `test/inventory.test.ts`
**Scope:** M

## Checkpoint B: real-machine run
- [x] `skillctx inventory` on the author's machine collapses ~590 entries into ~100 skills
- [x] Skills Manager copies group with their `~/.agents/skills` originals (or show as drift) — done in Task 8; 3 skills show real drift (older Skills Manager copies)
- [x] Review output with the user before adding provenance

## Provenance

### Task 6: npx skills lockfile adapter
**Description:** Read `~/.agents/.skill-lock.json` (v3) and attach `{source, sourceUrl, skillPath, skillFolderHash, installedAt, updatedAt}` to matching instances. Unknown versions degrade to no provenance.

**Acceptance criteria:**
- [x] 83 lock entries attach to the right skills on the author's machine; the 14 unlisted ones show "untracked"
- [x] Malformed or missing lockfile produces a warning, not a failure

**Verification:** fixture tests with a recorded lockfile; manual run.
**Dependencies:** 5
**Files:** `src/core/sources/npx-skills.ts`, `test/fixtures/sources/npx-skills/**`, `test/sources/npx-skills.test.ts`
**Scope:** S

### Task 7: Git checkout and gh skill provenance
**Description:** For instances whose realpath sits inside a git work tree, record origin URL, branch and HEAD. For `SKILL.md` frontmatter written by `gh skill` (repository, ref, tree SHA), record those.

**Acceptance criteria:**
- [x] The 8 `understand-*` skills show the origin repo and HEAD of `~/.understand-anything/repo`
- [x] A fixture with gh-style frontmatter yields repo/ref/tree provenance
- [x] Provenance keys are excluded from the content hash (hash unchanged when only they differ)

**Verification:** fixture tests (temp git repo); manual run.
**Dependencies:** 5
**Files:** `src/core/sources/git-checkout.ts`, `src/core/sources/gh-skill.ts`, `test/sources/git.test.ts`
**Scope:** M

### Task 8: Skills Manager adapter
**Description:** Enumerate `~/.skills-manager/skills` and read its `skills` table read-only (`source_type`, `source_ref`, `source_revision`, `remote_revision`, `content_hash`). Skip if the DB or expected columns are missing.

**Acceptance criteria:**
- [x] The 100 Skills Manager copies appear as instances with `source_type=import` provenance
- [x] DB opened read-only; schema mismatch logs a warning and falls back to plain enumeration

**Verification:** fixture DB test; manual run.
**Dependencies:** 5
**Files:** `src/core/sources/skills-manager.ts`, `test/sources/skills-manager.test.ts`
**Scope:** S

### Task 9: Claude plugin skills adapter (optional)
**Description:** Enumerate skills under `~/.claude/plugins/cache/**/skills/` using `installed_plugins.json` for plugin name and version.

**Acceptance criteria:**
- [x] The 2 paper-desktop skills appear with plugin name and version

**Verification:** fixture test; manual run.
**Dependencies:** 5
**Files:** `src/core/sources/claude-plugins.ts`, `test/sources/claude-plugins.test.ts`
**Scope:** S

## Checkpoint C
- [x] Every skill on the author's machine shows a source or "untracked"
- [x] Tests and lint pass

## Outdated check

### Task 10: Upstream checker and `inventory --check`
**Description:** For GitHub-sourced skills, fetch each repo's tree once and compare the folder's tree SHA at `skillPath` with `skillFolderHash`. For git checkouts, compare HEAD with `git ls-remote`. Status per skill: `up-to-date`, `outdated`, `unknown`, `error`, plus `checkedAt`. Use `gh auth token` when available. Cache responses in `.cache/`. Runs only under `--check`.

**Acceptance criteria:**
- [x] First step verifies on one real skill that `skillFolderHash` equals the GitHub tree SHA; if not, switch to the commit-date fallback in plan.md
- [x] One request per distinct repo; rate-limit responses map to `error` with a readable message
- [x] Without `--check`, no network calls (asserted by a test with networking stubbed to throw)

**Verification:** tests with recorded HTTP fixtures; manual `inventory --check` on the author's machine.
**Dependencies:** 6, 7
**Files:** `src/core/upstream/github.ts`, `src/core/upstream/git.ts`, `src/core/upstream/index.ts`, `test/upstream.test.ts`
**Scope:** M

## Local UI

### Task 11: Local server and API
**Description:** `skillctx ui` starts `Bun.serve` on 127.0.0.1, serves the built client and `GET /api/summary`, `GET /api/skills`, `GET /api/skills/:name` from inventory files, and opens the browser. `POST /api/refresh` requires a per-session token.

**Acceptance criteria:**
- [x] Binds only to loopback; refresh without the token returns 403
- [x] API responses match inventory files

**Verification:** server tests; manual open in browser.
**Dependencies:** 5
**Files:** `src/ui/server.ts`, `src/cli/commands/ui.ts`, `test/ui-server.test.ts`
**Scope:** M

### Task 12: Skills list view
**Description:** Table of skills: name, description, sources, number of agent roots it's visible in, drift flag, outdated status. Search plus filters by source, root and status.

**Acceptance criteria:**
- [x] Renders ~100 skills from the author's inventory without lag
- [x] Filters and search combine correctly
- [x] Works offline

**Verification:** component tests; manual check in browser.
**Dependencies:** 11
**Files:** `src/ui/client/**` (list view)
**Scope:** M

### Task 13: Skill detail view
**Description:** One skill: description, all instances with locations and how each is linked (symlink or copy), provenance per source, drift diff between differing copies, outdated details.

**Acceptance criteria:**
- [x] Shows each instance's root and whether it is a symlink or copy
- [x] Drift shows a file-level diff between two copies

**Verification:** component tests; manual check on a drifted skill.
**Dependencies:** 12
**Files:** `src/ui/client/**` (detail view), `src/ui/server.ts` (diff endpoint)
**Scope:** M

### Task 14: Refresh from the UI
**Description:** "Rescan" and "Check for updates" buttons call `POST /api/refresh` (scan, or scan + check) and update the view, with progress and errors shown.

**Acceptance criteria:**
- [x] Rescan reflects a newly added skill folder without restarting the server
- [x] Check for updates shows the network request count and any rate-limit error

**Verification:** server test for refresh; manual check.
**Dependencies:** 10, 13
**Files:** `src/ui/server.ts`, `src/ui/client/**`
**Scope:** S

## Checkpoint D: Phase 0 complete
- [x] `init`, `inventory`, `inventory --check`, `ui` work end to end on the author's machine
- [x] Workspace `git init` + commit shows only portable plain files
- [x] README usage section updated; spec open questions resolved or carried forward
- [ ] Review with the user

### Task 15 (optional): Workspace backup helper
**Description:** `skillctx backup init` runs `git init` in the workspace and makes the first commit; with `--github`, creates a private repo via `gh repo create` after an explicit confirmation prompt.

**Acceptance criteria:**
- [ ] Never pushes without confirmation
- [ ] Refuses if the workspace is already a git repo with a different remote

**Verification:** test against a temp workspace (no network); manual run.
**Dependencies:** 5
**Files:** `src/cli/commands/backup.ts`, `test/backup.test.ts`
**Scope:** S
