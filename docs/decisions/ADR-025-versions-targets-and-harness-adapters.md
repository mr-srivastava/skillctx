# ADR-025: Skill versions, project targets and harness adapters

## Status
Accepted. Amends ADR-002 (project versions ship as line diffs before section ops), ADR-003 (the project layer arrives in Phase 3 as project versions, mastered in the workspace), ADR-009 (project versions never live in `<repo>/.skillctx/`; a repo gets only a built copy), ADR-021 (Phase 2 and 3 scope) and ADR-022 (skillctx may also write settings keys a harness adapter declares, and deploys to project folders).

## Date
2026-10-04

## Context
ADR-021 made skillctx a skill manager with edits stored as diffs. It left three things open.

1. **Project-specific skills.** People keep a copy of a skill in a repo and tune it for that codebase. When the base skill changes they have to find every copy and merge by hand. Skills Manager's Project Workspaces show whether a project copy has drifted from the library copy, but they store copies, not changes, so "diverged" can only be resolved by picking a side. skillctx's answer, project patches, was scheduled for Phase 5 as section ops, behind the compiler. Project-level folders were deferred entirely (spec §11).
2. **The basics.** A diff manager is only useful inside a tool that also installs, finds, updates and deploys skills. The lifecycle around versions had not been designed: how updates are reviewed, what happens to edits made outside skillctx, conflicts, pinning, upstream that disappears, deleting skills in use.
3. **Harness bias.** skillctx is built with Claude Code, and harness facts are starting to leak into core (`readClaudePlugins` and `claudeAppSyncedLookup` are called directly from `src/core/inventory/scan.ts`; the core provenance types have `claude-plugin` and `claude-app-synced` kinds). Agents also differ in ways the model now depends on. They read different project folders. Some read other agents' folders. Only some can hide a global skill in one project: Claude Code has `skillOverrides` in `.claude/settings.local.json`. Precedence for a skill present both globally and in a project is undocumented for most of them.

This was worked out in a design discussion on 2026-10-04 with these goals: replace the author's own setup first, let other people adopt it later, and eventually replace Skills Manager.

## Decision

### 1. Three user-facing ideas: skill, version, target
- **Skill**: something from a source (git, skills.sh, a local folder, a ZIP, or adopted from another tool). Its identity is source plus path in that source, not its name.
- **Version**: a named form of a skill. Every skill has `upstream`. You create more as needed (`mine`, `convex-app`, `backend`). Each version records its **parent** (`upstream` or another version) and stores a line diff against the parent's build. "Version" is always yours; the upstream's history is made of **revisions**.
- **Target**: a place a skill appears. A global target is an agent's global folders. A project target is a registered project, deployed to the project folders of the agents chosen for it.

Each target holds at most one version of a skill, deployed under the skill's own name. Snapshots, diffs, builds and merges stay implementation detail: the UI never uses those words.

### 2. Versions belong to the skill; projects choose one
Several projects can use the same version. Forking from a project's cell names the version after the project and uses it only there by default, so the common case feels project-owned without needing a separate concept.

### 3. Chains are allowed, and updates never break a working target
A version can fork from any version (`upstream → mine → convex-app`). When a parent changes:
- Every descendant gets a **proposed** rebase. Nothing is applied until you accept.
- Conflicts are resolved top-down: `mine` before `convex-app`.
- A version with a conflict keeps its last good build deployed. The conflict waits in the update inbox.

### 4. The workspace holds the master copy; a repo gets a plain copy when you choose
Versions and their history live in the workspace. "Share with this repo" deploys a version into a project in copy mode, so teammates get an ordinary skill and need no skillctx. Team workflows on one version are out of scope for now.

### 5. Lifecycle rules
- **Install** accepts one pasted string: a GitHub URL, `owner/repo@skill`, a skills.sh link, or a whole `npx skills add …` command. Multi-skill repos open a picker. Paste-to-install ships before a skills.sh browse page.
- **Every install shows a preview**, whatever the source: the file list with scripts and executables flagged. Installed scanners (SkillSpector, Snyk Agent Scan) run, and a critical finding blocks unless explicitly overridden.
- **Updates go to one inbox.** Each entry shows the upstream diff, which versions it affects, and whether each rebases cleanly. Scripts that are new or changed in an update are highlighted. Clean entries can be accepted in bulk.
- **Edits made outside skillctx are captured, never overwritten.** If a deployed build (through a symlink) or a copy-mode deployment (including a copy shared into a repo) no longer matches what skillctx wrote, skillctx asks before rebuilding: save into this version, save as a new version, discard, or detach.
- **One working-copy mechanism** for edits, project versions and conflicts. Forking or editing a version, or a conflict, produces a working folder; conflicts carry standard 3-way markers. You, your editor or an agent edit it, then save or resolve stores the diff and rebuilds. No in-app editor at first.
- **The CLI with `--json` is the agent interface.** skillctx ships one plain `SKILL.md` describing it, deployed through the normal planner, so any harness can fork, edit and resolve versions. MCP is not needed for this.
- **Binary files** are tracked by hash, never diffed. An edit stores the whole file; a conflict means choosing yours or upstream's. Large stored files get a warning.
- **Track or pin.** Track (the default) follows the branch. Pin holds a revision; newer revisions show greyed out and stay out of the inbox. Versions inherit their skill's pin.
- **Orphaned upstream.** The update check tells apart a missing or private repo, a skill that moved inside the repo, and a revision that no longer exists. The skill keeps working, marked orphaned, with a "Re-point source" action. To make this safe, the snapshot of any skill that has a non-upstream version or is shared into a repo is committed, even when it could be fetched again (amends ADR-021's commit rule).
- **Name collisions.** Two skills with the same name need an alias to share a target: the build rewrites the frontmatter `name` (the open format requires it to match the folder) and leaves the snapshot untouched. A collision with an entry skillctx didn't create follows ADR-022: refuse, offer to adopt.
- **Deleting.** Deleting a skill shows every affected deployment and version, with two choices: remove everywhere, or detach (turn deployments into plain copies, then drop the skill). Deleting a version that is deployed asks what replaces it in each target, suggesting the parent.

### 6. Projects
- A project exists once added: in the UI, with `skillctx project add`, or offered on the first deploy to a folder. If you configure dev roots, folders there that already have skill folders are suggested; nothing is scanned otherwise.
- A project is identified by its normalized `origin` remote URL, with its path stored per machine in `local/`. Without a remote, it is matched by name after a prompt. Nothing is written into the repo to identify it.
- A project is a folder, by default the repo root; subfolders are allowed for monorepos.
- A project's page lists every skill its agents would load there, including skills skillctx didn't create, marked unmanaged with an Adopt action.

### 7. Harness-agnostic core, capability-based harness adapters
Core knows skills, versions, targets, folders, deployments, plans and capabilities, and never contains a harness name. It decides what should happen. A harness adapter knows one agent's facts and mechanisms and decides how. Adapters declare capabilities, and core plans with them:

| Capability | Used for |
| --- | --- |
| Global skill folders | Global targets |
| Project skill folders | Project targets |
| Also reads other agents' folders | Duplicate warnings; choosing the fewest folders (ADR-022) |
| Per-project hide | Removing a global skill from one project |
| Same-name precedence, global vs project | Planning a project version where a global one exists |
| Description budget | The budget meter |
| Usage signals | Phase 4 analytics |
| Frontmatter extensions | Preserved as-is; interpreted only by that adapter |

Any capability can be **unknown**. Core then takes a generic fallback and never special-cases a harness. For example, without per-project hide, "remove from project" means the skill moves from the global target to per-project deploys, and the plan says so.

There are three kinds of adapter, kept separate: **harness adapters** (where agents read and what they support), **source adapters** (where skills come from), and **provenance adapters** (other installers' records, including harness-owned ones such as Claude Code's plugin list).

Support comes in tiers:
- **Full**: every capability verified, with a date and a method (docs or tested). Claude Code, Codex and Cursor in v1; together they cover all three project folder conventions, an agent that reads several folders, and per-project hiding.
- **Basic**: folders only, everything else unknown. Gemini CLI and OpenCode.
- **Custom**: an agent defined in `skillctx.yaml` with a name and folders.

Built-in adapters are TypeScript: data plus small functions where a capability needs logic. `skillctx.yaml` can add custom agents and override declared values on built-ins (paths, precedence, budget). It can never add a mechanism, such as a new place to write. The UI shows every override.

Guards: no harness names in core outside adapter folders, checked in CI; a fake harness with unusual capabilities in the test suite; `SKILL.md` treated per the open Agent Skills format; docs and UI say "agent" when they mean any agent.

### 8. Writing harness settings
An adapter may declare settings keys it writes, implemented in code only. For Claude Code that is `skillOverrides.<skill-name>` in a project's `.claude/settings.local.json`, the per-machine file, never the shared `settings.json`. Each written key is recorded in the deployment record like a symlink, shown in a plan first, and removed only if recorded. A malformed file, or a key already holding a value skillctx didn't write, is a conflict, never overwritten. It is used only when hiding a global skill in one project.

The invariant becomes: skillctx writes outside its workspace only into agent skill folders and settings keys a harness adapter declares, only to entries in its deployment record (or foreign symlinks you confirmed it may take over), and only after showing a plan.

### 9. Facts verified before they are relied on
Before Phase 3, for Claude Code, Codex and Cursor: project folder paths, same-name precedence between global and project, and whether Claude Code's `skillOverrides: off` hides a global skill in that project. Checked by a script in `scripts/` that sets up test skills in temporary folders, so it can run again when a harness changes. Everything else ships as unknown.

### 10. UI shape
The library is the home screen: search, filters, an update badge, where each skill is deployed. A skill page shows its versions and their targets; a project page shows what each agent loads in that project, with add, remove and fork. The skills × targets grid is the model, not a screen.

### 11. Roadmap
Phase numbers stay; scope moves.

| Phase | Scope |
| --- | --- |
| 1 · Adopt and deploy | As planned (in progress) |
| 2 · Install, update, versions | Paste-to-install with preview, update inbox, track and pin, versions with chains, the working copy, outside-edit capture, the CLI skill for agents |
| 3 · Projects and organize | Harness adapters with capabilities, project registration and targets, project versions, share with repo, per-project hide, budget meter; then profiles (a named set of skill and version pairs applied to a target), tags, bulk actions, publishing versions, backup, the parity checklist |
| 4 · Analytics | Unchanged |
| 5 · Compile and context | Unchanged, except project versions already exist; section ops become a sturdier storage format for versions |

## Alternatives Considered

### Versions owned by projects
- Pros: a simpler model when every fork is project-specific
- Cons: three repos sharing one variant means three copies kept in sync by hand, the problem this solves
- Rejected: projects choose versions; the project-named default keeps the simple case simple

### Every version forks from upstream, no chains
- Pros: no cascading conflicts
- Cons: global tweaks (`mine`) have to be repeated in every project version
- Rejected: proposals, top-down resolution and last-good builds make chains safe

### Project patches stay in Phase 5 as section ops
- Pros: one storage format; survives reflowed upstream text
- Cons: the most-wanted capability waits on the compiler and the section parser
- Rejected: line diffs reuse Phase 2's machinery; section ops can replace them later

### Project versions mastered in the repo (`<repo>/.skillctx/`, ADR-009's opt-in)
- Pros: travels with the code
- Cons: teammates need skillctx to build anything; history splits across repos
- Rejected: a plain built copy in the repo shares the result without the tool

### Overwrite or freeze on outside edits, as Skills Manager does
- Pros: simple
- Cons: the most common way people lose work
- Rejected: capture is cheap in a diff model

### Keep the invariant at skill folders only
- Pros: the narrowest possible write surface
- Cons: a global skill can never be hidden in one project on harnesses that support it; every exclusion forces per-project deploys
- Rejected: declared keys in per-machine settings files, recorded and planned, keep writes auditable and reversible. The fallback still covers harnesses without the capability

### Harness logic as special cases in core
- Pros: faster for the first two or three agents
- Cons: each new agent adds branches; Claude-shaped assumptions spread unnoticed
- Rejected: capabilities with unknown as a value let basic and custom agents work with no code

### A full skills × targets grid as the main screen
- Pros: shows everything at once
- Cons: unreadable at 150 skills and 10 projects
- Rejected: skill pages and project pages are its two readable slices

## Consequences
- CLAUDE.md, spec §2 principle 2 and the glossary change to the new invariant. Writing settings needs its own writer and record entries, tested like the agent-folder writer.
- The deployment record and lockfile gain versions, project targets and settings-key entries; their formats get new numbers under ADR-023's rules when Phase 2 and 3 are planned.
- `src/core/deploy/agents.ts` becomes the harness adapter layer with capabilities. Claude plugin and Claude app provenance move behind provenance adapters. New core code stays free of harness names from now on; the CI check lands with the adapter layer in Phase 3.
- Builds can no longer be regenerated blindly: a build that differs from what skillctx last wrote is an outside edit and must be captured first.
- More snapshots get committed (any skill with a version or shared into a repo), so the workspace repo grows faster.
- A version's identity has to survive renames, because projects refer to it.
- Command names are proposals until Phase 2 planning: `install`, `update`, `pin`, `version fork`, `version save`, `resolve`, `project add`.
- ADR-004 is unchanged. A Rust engine may be revisited once this model is built; the `src/core/ops` seam (ADR-024) and versioned plain-file formats (ADR-014, ADR-023) keep that possible.
