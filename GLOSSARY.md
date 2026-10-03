# Glossary

Domain terms for skillctx. Architecture terms (module, interface, seam, adapter, depth, leverage, locality) follow the codebase-design vocabulary and aren't repeated here.

- **Workspace**: the folder at a user-chosen path (`<home>`) that holds everything skillctx owns. Plain files, git-backable (ADR-009).
- **Source**: where a skill comes from. Either another tool or location whose skills we read but never modify (npx skills, gh skill, Skills Manager, Skillshare, a plain folder), or something skillctx installs from (a git repo, skills.sh, a local folder, a ZIP).
- **Skill root**: a physical folder that contains skill folders, e.g. `~/.agents/skills`.
- **Skill instance**: one copy of a skill found in one skill root. Symlinks to the same real path are the same instance.
- **Skill**: all instances with the same name, grouped by the Indexer. Instances with different content hashes under one name are drift.
- **Provenance**: where an instance came from (source, URL, revision, upstream hash), as recorded by its source.
- **Provenance kind**: which tool recorded a provenance (`skill-lock`, `gh-frontmatter`, `git-checkout`, `skills-manager`, `claude-plugin`, `claude-app-synced`, and `skillctx` for skillctx's own deployments). What each kind means for install state, upstream checks, update commands and display is in one table, `src/core/provenance/kinds.ts`.
- **Inventory**: the Indexer's view of all skills, their instances, drift between copies, and outdated status, written to `<home>/inventory/`.
- **Inventory format**: the version number in every inventory file. Added fields keep it; changes an older reader would misread bump it (ADR-014).
- **Outdated**: upstream has a newer revision than the installed instance. Checked only on explicit refresh.
- **Drift**: two instances of one skill (same name) with different content hashes.
- **Agent**: a harness that loads skills from its own folders (Claude Code, Codex, Cursor, Gemini CLI). Called "Consumer" in the borrowed SkillRoot/Consumer vocabulary.
- **Managed skill**: a skill in skillctx's library, as opposed to one only read from another tool's folder (ADR-021).
- **Snapshot**: the immutable files of a managed skill as installed or adopted. Recorded in the lockfile with source, revision and content hash.
- **Adopt**: take a snapshot of a skill another tool installed into the library, leaving the original untouched.
- **Edit**: your change to a managed skill, stored as a diff against its snapshot and merged 3-way on update.
- **Library**: the workspace folder holding the lockfile, edits, and snapshots that can't be fetched again.
- **Build**: a snapshot with its edit applied, in `<home>/build/`. Regenerated, never committed.
- **Deployment**: a symlink or copy in an agent's skill folder pointing at a build. Listed in the per-machine deployment record; skillctx only modifies entries in that record (ADR-022).
- **Deployment plan**: the list of writes a deploy, undeploy or update would make, shown before anything is applied.
- **Takeover**: replacing another tool's symlink in an agent folder with a deployment, after confirmation. The replaced link is restored on undeploy. Real folders are never taken over (ADR-023).
- **Taken back**: a recorded deployment that another tool has since rewritten. skillctx reports it and stops treating it as its own.
- **Parity**: Skills Manager's users can switch to skillctx without missing anything day to day. Defined by a checklist, not by Skills Manager's changelog.
- **Skills Manager**: the desktop app xingkongliang/skills-manager. Not udayvarmora07/skills-manager, which the spec borrows vocabulary from.
- **Profile**: a named set of skills; Skills Manager presets import as profiles (Phase 3).
- **Section**, **variant**, **composite**, **project lens**, **project patch**, **lens rule**: see spec §4. Phase 5, not built yet.
