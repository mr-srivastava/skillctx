# Glossary

Domain terms for skillctx. Architecture terms (module, interface, seam, adapter, depth, leverage, locality) follow the codebase-design vocabulary and aren't repeated here.

- **Workspace**: the folder at a user-chosen path (`<home>`) that holds everything skillctx owns. Plain files, git-backable (ADR-009).
- **Source**: a tool or location that installs skills we read but never modify: npx skills, gh skill, Skills Manager, Skillshare, a plain folder.
- **Skill root**: a physical folder that contains skill folders, e.g. `~/.agents/skills`.
- **Skill instance**: one copy of a skill found in one skill root. Symlinks to the same real path are the same instance.
- **Skill**: all instances with the same normalized content hash, grouped by the Indexer.
- **Provenance**: where an instance came from (source, URL, revision, upstream hash), as recorded by its source.
- **Inventory**: the Indexer's view of all skills, their instances, drift between copies, and outdated status, written to `<home>/inventory/`.
- **Inventory format**: the version number in every inventory file. Added fields keep it; changes an older reader would misread bump it (ADR-014).
- **Outdated**: upstream has a newer revision than the installed instance. Checked only on explicit refresh.
- **Drift**: two instances with the same name but different content.
- **Agent**: a harness that loads skills from its own folders (Claude Code, Codex, Cursor, Gemini CLI). Called "Consumer" in the borrowed SkillRoot/Consumer vocabulary.
- **Section**, **variant**, **composite**, **profile**, **project lens**, **project patch**, **lens rule**: see spec §4. Not built yet.
