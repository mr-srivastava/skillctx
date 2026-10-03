# Skills Manager Rust codebase reference

Upstream: <https://github.com/xingkongliang/skills-manager>

This is a read-only reference for skillctx. The upstream project is MIT-licensed Rust/Tauri software, with a Rust backend and React/TypeScript frontend. The current default branch is `main`; this note was assembled on 2026-10-03 through GitHub's read-only API. A shallow `git clone` into a scratch folder also works and is quicker for reading many files; never vendor its code into this repo.

## Where to look upstream

- Rust dependency and runtime choices: [`src-tauri/Cargo.toml`](https://github.com/xingkongliang/skills-manager/blob/main/src-tauri/Cargo.toml)
- Rust command registration and Tauri bridge: [`src-tauri/src/lib.rs`](https://github.com/xingkongliang/skills-manager/blob/main/src-tauri/src/lib.rs), [`core/cli_bridge.rs`](https://github.com/xingkongliang/skills-manager/blob/main/src-tauri/src/core/cli_bridge.rs)
- Main domain behavior: [`src-tauri/src/core/`](https://github.com/xingkongliang/skills-manager/tree/main/src-tauri/src/core)
- Git operations / source fetch / backup: `git2_engine.rs`, `git_fetcher.rs`, `git_backup.rs`, `central_repo.rs`
- Install, sync and cross-agent adapters: `installer.rs`, `sync_engine.rs`, `tool_adapters.rs`, `scanner.rs`
- Persistent state, migration and locking: `skill_store.rs`, `migrations.rs`, `repo_lock.rs`, `path_guard.rs`
- Content identity: `content_hash.rs`
- Merge flow and integration tests: [`src-tauri/src/core/merge/`](https://github.com/xingkongliang/skills-manager/tree/main/src-tauri/src/core/merge)
- UI examples: `src/components/DocumentDiffViewer.tsx`, `SkillMarkdown.tsx`, and views `InstallSkills.tsx`, `MySkills.tsx`, `ProjectDetail.tsx`, `Backup.tsx`

## Best study order for skillctx

1. `core/merge/` and its integration tests for merge preview, conflict presentation, apply decisions, and recovery. Compare behavior with skillctx's immutable snapshot + diff model; do not assume the storage model is interchangeable.
2. `content_hash.rs` and `skill_store.rs` for identity and on-disk state conventions.
3. `scanner.rs` and `tool_adapters.rs` for supported agent roots and detection policy; compare the table against current agent documentation before copying paths.
4. `installer.rs`, `git_fetcher.rs`, and `git2_engine.rs` for GitHub/source acquisition and update UX.
5. `repo_lock.rs`, `path_guard.rs`, and `removals.rs` for failure-safe mutation patterns. Compare against skillctx's own plan/review/apply guarantees.
6. UI components only for interaction patterns—skillctx already has a different web UI architecture.

## Boundary

Use upstream as an implementation reference and compatibility target, not as code to transplant wholesale. skillctx intentionally differs in immutable snapshots, versions stored as diffs and rebased on update (project versions included), provenance across installers, user-reviewed plans, ownership records, and a harness-agnostic core with capability-based adapters (ADR-025). Preserve those invariants when adapting ideas. Two parts map closely: its `ReplacePolicy` and whole-batch preflight in `sync_engine.rs` match ADR-022's ownership rules, and its 54-agent `tool_adapters.rs` table is the long tail ADR-025 treats as basic-tier adapters. Its Project Workspaces store copies and compare them; skillctx stores project versions as changes, so do not copy that model.
