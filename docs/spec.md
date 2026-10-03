# skillctx spec

Status: draft v0.18 · 2026-10-04 · Owner: Aadarsh Srivastava
Decisions: [docs/decisions/](decisions/) · Research: [docs/research/community-research.md](research/community-research.md) · Engine review notes: [docs/reviews/](reviews/)

"skillctx" is a working name. This file is the only copy of the spec; an earlier Claude Doc copy is superseded.

## 1. Problem and summary

skillctx is a local skill manager for coding agents. Install, deploy and edit skills without losing upstream updates, see where every skill came from and whether it's used, and later compile project-specific skills ([ADR-021](decisions/ADR-021-skillctx-becomes-a-skill-manager.md)).

Phase 0 is built: a read-only inventory of every skill on your machine, across all the tools that installed them, showing duplicates, edits and what's out of date. Phase 1, adopting skills into a library and deploying them through a plan, is built and awaiting its real-machine checkpoint. The next phases add what a skill manager does (adopt, deploy, install, update, edit, organize), each built so your edits survive updates and every skill keeps its provenance. You can keep several versions of a skill, such as your own tweaks or one tuned for a project, and an upstream update flows into all of them ([ADR-025](decisions/ADR-025-versions-targets-and-harness-adapters.md)). Usage analytics and the compiler follow. Everything skillctx owns lives in one workspace folder you choose, which you can back up to your own GitHub repo ([ADR-009](decisions/ADR-009-workspace-at-user-chosen-home.md)).

Five things are broken in how skills work today.

1. Skills load whole. A frontend task pulls in all of `api-and-interface-design`, database and backend sections included.
2. Agents forget. Every new session works out again how a skill applies to this codebase, and the only fix is copying the skill into the repo.
3. You can't safely customize. Edit an upstream skill and the next update overwrites it. Copy it and you stop getting updates.
4. You can't see what you have. Which skills are installed, where, at what version, is buried in hidden folders.
5. There's no feedback. Nobody knows which skills get used, which get opened and ignored, or which give bad advice.

The research ([community research](research/community-research.md)) showed these aren't equally open, and that shaped the order we build in.

| Problem | Evidence | Our stance |
| --- | --- | --- |
| No visibility | Crowded: Skillshare, Skills Manager, SkillSpector. Existing managers only know the provenance of skills they installed | Built (Phase 0): cross-installer inventory and provenance. Management features reach parity with Skills Manager in Phases 1–3 |
| No safe customization | Repeated user questions with no answers; the only overlay design (Hermes) is unbuilt | Versions stored as diffs on immutable snapshots and rebased on update (Phase 2); project versions (Phase 3); section ops later |
| No feedback | 39 of 49 coding skills gave zero gain in SWE-Skills-Bench; tools count invocations only | Usage analytics on deployed skills (Phase 4) |
| Context pollution | Claude Code caps skill descriptions at ~1% of context; over budget, skills stop being picked. Focused skills (≤3 modules) beat exhaustive bundles in SkillsBench | The compiler (Phase 5) |
| No memory between runs | Crowded: claude-mem (~84k stars), convention MCPs | Narrow: lens rules tied to sections (Phase 5) |

In short, skillctx manages your skills itself, or adopts ones other tools installed without touching the originals. Your edits sit on top of immutable snapshots, so updates don't wipe them. A CLI and MCP server come later for search, code grounding and usage tracking.

## 2. Positioning and non-goals

Skills Manager and Skillshare already install, deploy and sync skills well. skillctx matches Skills Manager's day-to-day features so its users can switch, but builds each one on its own model: snapshots, diffs, builds and deployments as plain files. That model is what makes cross-installer provenance, edits that survive updates, and usage analytics possible.

| Layer | Who else does it | Our role |
| --- | --- | --- |
| Publish and registry | skills.sh, GitHub, Tessl | Install from them; browse skills.sh. No registry of our own |
| Install and update | `npx skills`, `gh skill`, Skills Manager | Install and update managed skills; read other installers' lockfiles and libraries as provenance; adopt their skills without modifying them |
| Library, deploy, sync | Skills Manager, Skillshare | Library of immutable snapshots plus your diffs; planned deploys into agent folders (ADR-022); profiles from presets; backup by git push |
| Security scanning | NVIDIA SkillSpector, Snyk Agent Scan | Run them on install and on compiled output |
| Session memory | claude-mem, memory and convention MCPs | Coexist; we hold only curated lens rules |
| Use: patch, measure, compile, retrieve | Nobody yet | skillctx |

### Design principles

1. Never write into a skill someone else published. Snapshots are immutable; skills other tools installed are adopted, not modified.
2. Write outside the workspace only into agent skill folders and settings keys a harness adapter declares, only to entries skillctx recorded, and only after showing a plan (ADR-022, ADR-025). Never touch an entry skillctx didn't create.
3. Work through a CLI and plain files first. The web UI and MCP sit on top.
4. Keep everything on the machine. No account, no server, no telemetry. Network only on explicit actions: install, check for updates, restore, browse skills.sh, push.
5. Build parity on our model, not Skills Manager's. A parity feature that needs a mutable library is redesigned, not copied.
6. Ship less. Compiled skills hold only in-scope sections, ideally three modules or fewer per task. SkillsBench found focused bundles beat exhaustive ones.
7. Fix advice that doesn't match the stack. In SWE-Skills-Bench, guidance written for a different version was one of the main reasons skills made results worse. Edits, patches and lens rules exist for this.
8. Suggest, don't rewrite. Usage data feeds suggestions you approve, never silent edits.
9. Stay harness-agnostic. Core never names a harness; harness adapters declare what each agent supports, and an unknown capability gets a generic fallback, not a special case (ADR-025).
10. Never break a working setup. Updates are proposals, a conflict keeps the last good build deployed, and edits made outside skillctx are captured, never overwritten.

### Non-goals

- A skill registry or marketplace of our own (browsing skills.sh is in scope).
- Session memory (capturing and replaying what an agent did).
- Our own security scanner; we call existing ones.
- Our own sync service. The workspace is plain files you push to your own GitHub repo; cloud storage is a later option (ADR-009).
- A hosted or multi-user service, accounts, or telemetry.
- A desktop app (ADR-005).
- Managing MCP server configs.

## 3. Packaging and user flow

skillctx is a CLI with a local web UI. All its data lives in a workspace at a path you pick (ADR-009). There's no proxy, no background daemon and no desktop app ([ADR-005](decisions/ADR-005-cli-and-local-web-ui-no-desktop-app.md)).

A managed skill moves through plain-file stages ([ADR-021](decisions/ADR-021-skillctx-becomes-a-skill-manager.md)):

```
source → snapshot → version (diff) → build → deployment to a target
```

- **Source**: where the skill comes from: a git repo, skills.sh, a local folder, a ZIP, or an existing install by another tool (adopted).
- **Snapshot**: the skill's files as installed or adopted, never changed afterwards. Recorded in the lockfile with source, revision and content hash.
- **Version**: a named form of the skill. `upstream` is the snapshot itself; every other version (`mine`, `convex-app`) is a diff against its parent version. On update, diffs are rebased 3-way onto the new snapshot ([ADR-025](decisions/ADR-025-versions-targets-and-harness-adapters.md)).
- **Build**: a version with its diffs applied, in `<home>/build/`. Regenerated, but never over an edit skillctx didn't make (see "Lifecycle rules" below).
- **Deployment**: a symlink (default) or copy from a target's skill folder to a build, recorded per machine ([ADR-022](decisions/ADR-022-deploying-into-agent-folders.md)). You choose agents; the planner picks the fewest folders that reach them and warns when an agent would see a skill twice. Every deploy shows a plan first, and an entry skillctx didn't create is never replaced without adopting it and confirming.

Skills Manager can keep running alongside. skillctx reads its library as a source and offers an explicit, read-only "Import from Skills Manager" that adopts its library, turns presets into profiles and copies tags.

### A user's first day

Today (Phases 0 and 1):

```bash
npm i -g skillctx                   # or npx skillctx
skillctx init --home ~/skillctx     # create the workspace, detect skill sources
skillctx inventory                  # scan all sources, write <home>/inventory/
skillctx inventory --check          # explicit refresh: compare against upstream (network)
skillctx ui                         # browse skills; adopt and deploy from a skill's page
skillctx adopt tdd                  # snapshot an installed skill into the library
skillctx deploy tdd --agent claude,codex   # show the plan, then link it into their folders
skillctx import skills-manager      # adopt Skills Manager's library, keep presets and tags
cd ~/skillctx && git init && git remote add origin <your repo>   # optional backup
```

Later (Phases 2 and 3, names not final):

```bash
skillctx install vercel-labs/agent-skills@react-best-practices   # preview, then snapshot
skillctx version fork tdd mine      # working copy; edit it, then `skillctx version save`
skillctx update                     # fill the update inbox; accept to rebase every version
skillctx project add ~/Dev/convex-app
skillctx version fork tdd convex-app --from mine   # a project version, deployed there
```

Phase 1 adds adopting, importing from Skills Manager and deploying. Phase 2 adds installing, updating and versions; Phase 3 adds projects. Proposed command names, final at Phase 2 planning: `install`, `update`, `pin`, `version fork`, `version save`, `resolve`, `project add`.

### Skills, versions and targets

What you see in the UI and CLI comes down to three ideas ([ADR-025](decisions/ADR-025-versions-targets-and-harness-adapters.md)). Snapshots, diffs, builds and merges are implementation detail and never appear in the UI.

- **Skill**: something from a source. Its identity is the source plus its path there, not its name.
- **Version**: a named form of a skill (`upstream`, `mine`, `convex-app`). Versions belong to the skill; several projects can use the same one. A version forks from any other version, so chains like `upstream → mine → convex-app` are allowed. "Version" is always yours; upstream has **revisions**.
- **Target**: a place a skill appears. A global target is an agent's global folders; a project target is a registered project, deployed to the project folders of the agents chosen for it. Each target holds at most one version of a skill, deployed under the skill's own name.

The model is a grid of skills × targets in which each cell holds a version or nothing. The UI shows it in two slices rather than one big grid. The library is the home screen (search, filters, update badge, where each skill is deployed). A skill page shows its versions and their targets. A project page shows what each agent loads in that project, including skills skillctx didn't create, marked unmanaged with an Adopt action.

```
                 Global          skillctx repo     convex-app repo
api-design       mine            mine              convex-app
react-patterns   upstream        ·                 upstream
tdd              mine            ·                 ·
```

**Projects.** A project exists once you add it (UI, `project add`, or offered on the first deploy to a folder). If you configure dev roots, folders there that already have skill folders are suggested. A project is identified by its normalized `origin` remote URL, with its path stored per machine in `local/`; without a remote it is matched by name after a prompt. Nothing is written into the repo to identify it. A project is a folder, by default the repo root; subfolders work for monorepos.

**Sharing.** The workspace holds every version and its history. "Share with this repo" deploys a version into a project in copy mode, so teammates get an ordinary skill with no skillctx needed. A published version builds to a known path in your workspace repo, so others can install it, with skillctx (keeping the link to its base) or with any installer (as a plain skill). Team workflows on one version are out of scope for now.

### Lifecycle rules

- **Install** takes one pasted string: a GitHub URL, `owner/repo@skill`, a skills.sh link, or a whole `npx skills add …` command. Multi-skill repos open a picker. A skills.sh browse page comes after paste-to-install.
- **Install preview.** Every install, from any source, shows the file list with scripts and executables flagged. Installed scanners run; a critical finding blocks unless explicitly overridden.
- **Update inbox.** Update checks (explicit, never in the background) fill one inbox. Each entry shows the upstream diff, which versions it touches and whether each rebases cleanly, and highlights new or changed scripts. Clean entries can be accepted in bulk; nothing rebases until you accept.
- **Chains.** When a parent changes, descendants get proposed rebases, resolved top-down. A version with a conflict keeps its last good build deployed.
- **Outside edits.** If a build (edited through a symlink) or a copy-mode deployment (including a copy shared into a repo) differs from what skillctx wrote, skillctx asks before rebuilding: save into this version, save as a new version, discard, or detach.
- **Working copy.** Editing or forking a version, and resolving a conflict, all produce a working folder; conflicts carry standard 3-way markers. You, your editor or an agent edit it; `version save` or `resolve` stores the diff and rebuilds. No in-app editor at first.
- **Agents drive the CLI.** The CLI with `--json` is the agent interface. skillctx ships one plain `SKILL.md` that describes it, deployed through the normal planner, so any harness can fork, edit and resolve versions.
- **Binary files** are tracked by hash and never diffed. An edit stores the whole file; a conflict means choosing yours or upstream's.
- **Track or pin.** Track follows the branch (default). Pin holds a revision; newer ones show greyed out and stay out of the inbox. Versions inherit their skill's pin.
- **Orphaned upstream.** A missing or private repo, a skill that moved inside its repo, and a revision that no longer exists are told apart. The skill keeps working, marked orphaned, with a "Re-point source" action.
- **Name collisions.** Two different skills with one name need an alias to share a target; the build rewrites the frontmatter `name` and leaves the snapshot alone.
- **Deleting** a skill shows every affected deployment and version: remove everywhere, or detach (deployments become plain copies). Deleting a deployed version asks what replaces it in each target.
- **Budget meter.** Per target, the total size of skill descriptions against the harness's budget, where the harness adapter knows it. Unknown budgets show no meter, never a guess.

### Compiler (Phase 5)

Harnesses already load skills in stages. They read each skill's `name` and `description`, open `SKILL.md` when one matches, and read reference files only when asked. That mechanism is fine. Upstream skills just aren't shaped for it, so the compiler reshapes them and delivers the result through the same deployment planner.

```
<home>/compiled/<project>/api-design/   generated by skillctx build
  SKILL.md      sharp description + index of in-scope sections + top lens rules
  sections/     one file per in-scope section, patches applied
```

#### Compiler rules

1. Stay inside the description budget. Claude Code gives all skill descriptions about 1% of context (around 8,000 characters at 200k) and quietly drops the least-used ones past that. `build` writes short descriptions that lead with when to use the skill, reports the total per agent, and warns before the limit.
2. Produce fewer skills. Merge related in-scope sections into one compiled skill instead of mirroring every upstream skill.
3. Follow Anthropic's layout guidance. `SKILL.md` stays under 500 lines, section files sit one level deep, and any file over 100 lines starts with a contents list.
4. Avoid duplicates. If the original skill is also installed in the same agent folder, offer to disable it or compile under a different name.
5. Scan before writing. If SkillSpector or Snyk Agent Scan is installed, run it on the output and refuse to write on a critical finding.
6. Keep lens rules in view. The top rules go into the compiled `SKILL.md`. For Claude Code and Codex there's also an optional session-start hook, so the rules load even when no skill triggers.

#### Read modes

Set per project in `lens.yaml`.

| Mode | Compiled index points to | Analytics |
| --- | --- | --- |
| `files` (default) | `sections/*.md` files | From harness telemetry/hooks only |
| `cli` | `skillctx get section:…` commands | shown and opened events, no server |

Nothing runs in the background. The CLI starts, reads SQLite and exits. The harness starts the MCP server when it needs it. The dashboard exists only while `skillctx ui` is open, and `skillctx watch` is opt-in.

## 4. Core concepts and data model

Managed skills are whole-skill snapshots with your versions on top. Sections (Phase 5) refine that: the compiler, section ops and lenses work on heading-delimited parts of a skill.

| Concept | What it is | Entity ref | Stored where |
| --- | --- | --- | --- |
| Installed skill | A skill another tool installed, read in place and never modified | `skill:vercel-react@a1b2c3` | Its own folder; listed in `<home>/inventory/` |
| Snapshot | Immutable copy of a managed skill's files, taken at install or adopt | `snapshot:<name>@<hash>` | `<home>/library/` (committed if it can't be fetched again, or if the skill has a non-upstream version or is shared into a repo) |
| Version | Named form of a skill: `upstream`, or a diff against a parent version (Phase 2) | `version:<name>@mine` | `<home>/library/` (committed) |
| Lockfile | Source, revision, pin and content hash of every managed skill, and its versions | n/a | `<home>/library/lock.json` (committed) |
| Build | A version with its diffs applied | n/a | `<home>/build/` (git-ignored, regenerated unless edited outside skillctx) |
| Target | Where a skill appears: an agent's global folders, or a registered project (Phase 3) | `target:global`, `target:<project>` | Projects in `<home>/projects/`; paths per machine in `local/` |
| Deployment | One version in one target: a link or copy, or a settings key a harness adapter declares | n/a | Per-machine record in `local/deployments.json` (git-ignored) |
| Harness adapter | One agent's folders and capabilities (ADR-025) | n/a | Built in; custom agents and overrides in `skillctx.yaml` |
| Profile | Named set of skill and version pairs, applied to a target; Skills Manager presets import as profiles (Phase 3) | `profile:react-convex` | `<home>/profiles/` |
| Inventory entry | All copies of one skill name on the machine, with provenance and outdated status | `skill:<name>@<hash>` | `<home>/inventory/` |
| Event | One usage signal (shown, opened, applied, corrected) (Phase 4) | n/a | Local SQLite |
| Section | Heading-delimited chunk with tags and a one-line summary (Phase 5) | `section:api-design#frontend-contracts` | Index only |
| Variant | A version stored as section ops instead of a line diff (Phase 5; versions as diffs come first) | `variant:api-design@frontend` | `<home>/variants/` |
| Composite | New skill assembled from sections of several skills/variants (Phase 5) | `composite:react-data-layer` | `<home>/variants/` |
| Project lens | Per-project scope, profile, pinned sections, read mode, rules (Phase 5) | `lens:<project>` | `<home>/projects/<project>/lens.yaml` (or opt-in `<repo>/.skillctx/`) |
| Project patch | A project version stored as section ops (Phase 5; project versions as diffs ship in Phase 3) | `patch:<project>/api-design` | `<home>/library/`, like any version; never in the repo (ADR-025) |
| Lens rule | One-line fact about this repo ("we use Zod, not valibot") (Phase 5) | `rule:<repo>/zod-validation` | Inside the lens |
| Compiled skill | Lean project-scoped skill (Phase 5) | n/a | `<home>/compiled/`, deployed like a build |

The inventory groups copies by skill name. Copies with the same name and different content hashes are drift. Symlinks to the same real path count as one copy.

For physical files we borrow vocabulary from udayvarmora07/skills-manager's ADR-002 (`SkillRoot` → `Consumer` → `SkillInstance` → `EffectiveSkill`). That is a different project from xingkongliang/skills-manager, the "Skills Manager" app this spec refers to everywhere else.

Every snapshot, variant, composite and section records `{source, revision, content_hash}`, plus `section_anchor` for sections. Like `gh skill`, we also write this into frontmatter so it travels with the file.

Changes stack like CSS, as a chain of versions: the snapshot (never edited), then your personal version, then a project version (`upstream → mine → convex-app`). See [ADR-003](decisions/ADR-003-three-layer-storage-cascade.md); locations per [ADR-009](decisions/ADR-009-workspace-at-user-chosen-home.md), [ADR-021](decisions/ADR-021-skillctx-becomes-a-skill-manager.md) and [ADR-025](decisions/ADR-025-versions-targets-and-harness-adapters.md).

```
<home>/              a folder you choose; push it to your own GitHub repo if you like
  skillctx.yaml      workspace config: sources, agents, settings
  local.yaml         per-machine settings; git-ignored
  local/             per-machine state: deployments.json, the deployment record; git-ignored (Phase 1)
  inventory/         every skill on the machine: copies, provenance, outdated status
  library/           lock.json, versions, and snapshots/ (committed); fetched/ for snapshots that can be fetched again (git-ignored) (Phase 1)
  build/             snapshots with edits applied; agents link here; git-ignored (Phase 1)
  profiles/          named skill sets (Phase 3)
  variants/          section-op variants and composites (Phase 5)
  projects/<name>/   registered project: remote URL, chosen agents (Phase 3); lens.yaml (Phase 5)
  compiled/          compiler output (Phase 5)
  .cache/            index.db, events.db; rebuildable, git-ignored
```

Committed files are plain text with no machine-specific absolute paths, so the workspace can move between machines and later back up to cloud storage.

`inventory/` holds one JSON file per skill under `inventory/skills/`, plus `summary.json` and, after an explicit check, `upstream.json`. Every file carries a `format` number. Added fields keep the number; anything an older reader would misread bumps it, and a reader refuses formats newer than it knows ([ADR-014](decisions/ADR-014-versioned-inventory-format.md)).

## 5. Architecture

```
 Sources                     Core (local)                         Surfaces
 ┌───────────────────┐       ┌───────────────────────────────┐    ┌──────────────────┐
 │ git, skills.sh    │       │ Source adapters + Indexer     │    │ CLI: skillctx    │
 │ local folder, ZIP │──────▶│ Library: snapshots, lockfile, │───▶│ Web UI (local)   │
 │ npx skills lock   │ read, │   versions, 3-way rebase      │    │ MCP (Phase 5)    │
 │ gh skill          │ adopt │ Builder → <home>/build/       │    └──────────────────┘
 │ Skills Manager    │       │ Deployment planner + writer ──┼──▶ Harness adapters ──▶ Agent skill
 │ Plain folders     │       │ Event log (Phase 4)           │    (capabilities)       folders, declared
 └───────────────────┘       │ Compiler, context (Phase 5)   │                         settings keys
                             └───────────────────────────────┘                         (record-owned)
```

Phase 0 built the source adapters, the Indexer and the inventory UI. Phase 1 adds the library and the deployment planner and writer; the compiler later reuses both. Core operations are single functions the CLI, the UI and MCP all call, with the network and the clock injected (see `refreshInventory`). Operations that combine several core modules live in `src/core/ops/`, so surfaces only parse input and render output. Writes hold one workspace lock, and the UI applies a plan only if planning again gives the plan the person reviewed ([ADR-024](decisions/ADR-024-shared-operations-and-workspace-lock.md)).

### Harness adapters

Core knows skills, versions, targets, folders, deployments, plans and capabilities, and never names a harness. It decides what should happen ("`tdd` is not visible in project X"). A harness adapter knows one agent's facts and mechanisms and decides how ([ADR-025](decisions/ADR-025-versions-targets-and-harness-adapters.md)). Adapters declare capabilities, and the planner works from those:

| Capability | Used for |
| --- | --- |
| Global skill folders | Global targets |
| Project skill folders | Project targets |
| Also reads other agents' folders | Duplicate warnings; choosing the fewest folders |
| Per-project hide | Removing a global skill from one project |
| Same-name precedence, global vs project | Planning a project version where a global one exists |
| Description budget | The budget meter |
| Usage signals | Phase 4 analytics |
| Frontmatter extensions | Preserved as-is; interpreted only by that adapter |

Any capability can be unknown, and core then takes a generic fallback. Without per-project hide, removing a global skill from one project moves it from the global target to per-project deploys, and the plan says so.

Three kinds of adapter stay separate: harness adapters (where agents read and what they support), source adapters (where skills come from), and provenance adapters (other installers' records, including harness-owned ones such as Claude Code's plugin list).

| Tier | What the adapter provides | Agents |
| --- | --- | --- |
| Full | Every capability verified, with a date and a method (docs or tested) | Claude Code, Codex, Cursor |
| Basic | Folders only; everything else unknown | Gemini CLI, OpenCode |
| Custom | A name and folders in `skillctx.yaml` | Anything else |

Built-in adapters are TypeScript (data plus small functions where a capability needs logic). `skillctx.yaml` can add custom agents and override declared values on built-ins, such as paths, precedence or budget. It can never add a mechanism, such as a new place to write, and the UI shows every override.

**Settings keys.** An adapter may declare settings keys it writes, implemented in code only. For Claude Code that is `skillOverrides.<skill-name>` in a project's `.claude/settings.local.json` (per machine, never the shared `settings.json`), used only to hide a global skill in one project. Each key is recorded in the deployment record and shown in a plan first. A malformed file, or a key holding a value skillctx didn't write, is a conflict and is never overwritten.

**Guards.** No harness names in core outside adapter folders, checked in CI. A fake harness with unusual capabilities in the test suite. `SKILL.md` treated per the open Agent Skills format. Before Phase 3, a script in `scripts/` verifies project folder paths, global-vs-project precedence and Claude Code's `skillOverrides` behavior for the three full-tier agents, and can be re-run when a harness changes.

Today harness facts live in `src/core/deploy/agents.ts` and `src/core/sources/roots.ts` as data, but Claude plugin and Claude app provenance are wired directly into `src/core/inventory/scan.ts`. Both move behind adapters in Phase 3.

## 6. Surfaces

### Management operations

Phases 1–3 add these to the CLI and the web UI. Names for Phase 2 and 3 operations aren't final.

| Operation | What it does | Phase |
| --- | --- | --- |
| adopt | Snapshot a skill another tool installed into the library; original untouched | 1 (built: CLI, UI) |
| import Skills Manager | Adopt its library; presets → profiles; copy tags. Read-only on its side | 1 (built: CLI) |
| deploy / undeploy | Plan, show, then apply links or copies for the chosen agents | 1 (built: CLI, UI) |
| install | Paste a URL, `owner/repo@skill`, skills.sh link or `npx skills add` command; preview files and scripts; record provenance | 2 |
| update | Check upstream; fill the update inbox; accepted entries rebase every affected version | 2 |
| pin / track | Hold a skill at a revision, or follow its branch | 2 |
| version fork / save | Open a working copy of a new or existing version; save stores a diff and rebuilds | 2 |
| resolve | Store a resolved conflict from the working copy as the new diff | 2 |
| capture | Turn an edit made outside skillctx into a version, discard it, or detach | 2 |
| delete | Remove a skill everywhere or detach it, through a plan | 2 |
| project add | Register a project (remote URL, path on this machine, agents) | 3 |
| deploy to project / hide in project | Put a version in a project target; hide a global skill there (settings key or per-project fallback) | 3 |
| share with repo | Deploy a version into a project in copy mode, for teammates | 3 |
| profiles, tags, bulk actions | Organize and act on many skills at once | 3 |
| publish version | Build a version to a known path in the workspace repo so others can install it | 3 |
| backup | Commit and push the workspace to your own repo | 3 |

### Planned agent operations (Phase 5, CLI and MCP)

These operations describe the intended context engine surface. CLI and MCP return identical payloads. None is implemented yet; the [README](../README.md) lists the commands that exist.

| Operation | CLI | Returns |
| --- | --- | --- |
| search | `skillctx search "<query>" [--project .]` | Slim index: refs, summaries, section tables, usage hints, top 2 lens rules |
| get | `skillctx get <ref>` | Full body of one section, variant or composite |
| context | `skillctx context "<task>" --project . [--budget 4000]` | Bundle: sections + lens rules + code anchors within budget |
| verify | `skillctx verify <draft-file>` | Existing items overlapping a proposed draft |
| propose | `skillctx propose <draft-file>` | Saves a draft for human review; never publishes |

All take optional `prev` (`used`, `skipped`, `why`) and `traceId`. The engine review recommends cutting these to two tools (`context` and `get`); that is undecided until Phase 5 design.

Phase 5 human commands: `build [--agent claude,codex]`, `status`, `check` (CI), `watch`, `stats`. Variants and project patches are versions, so they use the Phase 2 commands (`version fork`, `version save`, `update`, `resolve`).

### Fallback for agents without skill folders

A small stub skill or one `AGENTS.md` line tells the agent to call `skillctx context` (Phase 5).

### Web UI

`skillctx ui` is a loopback-only page with a per-session token for every action that changes something. Today it shows the inventory (every skill, where it lives, who installed it, its files, differences between copies, and updates) and, on each skill's page, adopting and deploying through a plan you confirm (Phase 1). It grows with the phases: paste-to-install, the update inbox, versions and conflict review, with "open in editor" for the working copy (Phase 2); project pages, project versions, the budget meter, then profiles, tags and bulk actions (Phase 3); usage and pruning suggestions (Phase 4); variants, lenses and the analytics funnel (Phase 5).

## 7. Context assembly and grounding (Phase 5)

`context` returns a ranked bundle under a token budget.

```
skillctx context "add a loader to the orders route" --project ./app

## Relevant rules (this repo)
- zod-validation: validate loader input with Zod, not valibot
- data-access: loaders call services/, never the DB client directly
## Sections
- section:tanstack-start#loaders      (applied 11/13 here) → full text
- section:vercel-react#data-fetching  (summary only)       → get to expand
## Code anchors
- routes/products.tsx  productsLoader  (existing example of the pattern)
- routes/orders.tsx    OrdersRoute     (target file)
```

The pipeline goes scope (lens tags) → retrieve (FTS5 first, embeddings optional; [ADR-006](decisions/ADR-006-sqlite-fts5-first.md)) → rank (score, pins, decayed usage prior) → ground (cache `section → [file, symbol, follows|violates]`, code-graph fallback via CodeGraph / codebase-memory-mcp / trace-mcp) → disclose a little at a time → attach the top 2 lens rules on every call (dedupe by `dedupe_key`).

Stateless calls: each carries `projectPath`, optional `traceId`, `conversationId` (trims boilerplate only).

## 8. Versions, variants, patches and upstream rebase

Versions are stored in two forms, in this order ([ADR-021](decisions/ADR-021-skillctx-becomes-a-skill-manager.md), [ADR-025](decisions/ADR-025-versions-targets-and-harness-adapters.md)).

**Versions as diffs (Phase 2; project versions in Phase 3).** You edit a working copy of a version; skillctx stores the change as a line diff against the parent version's build. When upstream or a parent changes, each descendant's diff is rebased 3-way, top-down, as a proposal in the update inbox:

| State | Meaning | Default action |
| --- | --- | --- |
| Clean | The diff applies | Apply on accept; rebuild; redeploy |
| Conflict | The parent changed the same lines | Stop; keep the last good build deployed; open a working copy with conflict markers |
| Redundant | The parent now contains your change | Suggest dropping the diff |

Binary files are never diffed: an edit stores the whole file, and a conflict means choosing one side.

**Section ops (Phase 5).** A sturdier storage format for the same versions. Variants and project patches are operations on named sections, which survive upstream reflowing text better than line diffs. See [ADR-002](decisions/ADR-002-section-ops-for-variants-and-patches.md). The rest of this section describes them.

```yaml
base: skill:api-and-interface-design
base_revision: a1b2c3
base_hash: sha256:…
scope_tags: [frontend, api-contract]
ops:
  - keep: ["#frontend-contracts", "#type-safety"]
  - drop: ["#db-schema", "#backend-services"]
  - replace:
      section: "#validation"
      anchor: "Use io-ts for runtime validation"
      with: "Use Zod for runtime validation."
  - append:
      section: "#frontend-contracts"
      text: "API types are generated into src/api/types.ts; never hand-write them."
```

A raw-diff op exists as an escape hatch; Phase 2 edits convert to it.

### Section-op rebase states

| State | Meaning | Default action |
| --- | --- | --- |
| Clean | All anchors found | Auto-apply |
| Fuzzy | Anchor moved or changed slightly | Auto-apply, flag |
| Conflict | Anchor gone or section rewritten | Stop; serve last good build, marked stale |
| Redundant | Upstream now says what the op said | Suggest deleting the op |
| Orphaned | Target section removed upstream | Suggest dropping or retargeting |

- Policy per project in `lens.yaml` (`auto: [clean, fuzzy]`).
- Conflicts never guess: 3-way diff; LLM may draft a fix, never commits it.
- `skillctx check` fails CI on conflict/orphaned.
- `lock.json` pins hashes for reproducible builds.
- Draft vs published per variant; publishing needs description, scope tags, base, clean `verify`. Every publish is a git commit.

## 9. Analytics

Analytics comes in two steps. See [ADR-008](decisions/ADR-008-local-usefulness-analytics.md).

**Skill usage (Phase 4).** For skills skillctx deployed, hooks record when an agent loads a skill or reads one of its files. How that works depends on each harness adapter's usage-signal capability (ADR-025): today Claude Code and Cursor hooks give file paths, Codex mapping is heuristic, and agents with no signal get no usage data. The deployment record maps those paths back to skills. The UI shows per-skill usage and suggests pruning skills unused for 30 days. Everything stays in local SQLite.

**Section funnel (Phase 5).** Once the compiler and read path exist, track per section: shown → opened → applied → held up.

| Event | Source | Captured by |
| --- | --- | --- |
| shown | Ref in `search`/`context` result | Layer |
| opened | `get` on ref | Layer |
| applied | Agent reports used | `prev.used` |
| skipped | Agent reports not useful | `prev.skipped` + `why` |
| corrected | You flag guidance wrong here | Web UI / `skillctx flag` |
| miss | No hit above threshold | Layer |
| re-search | Same topic within 2 min of a `get` | Inferred |

Events come from our own CLI and MCP calls, from Claude Code's OpenTelemetry output (`CLAUDE_CODE_ENABLE_TELEMETRY=1`) through a local collector, and from a `PreToolUse` hook where telemetry is off.

Live usage tells you what agents opened. It can't tell you whether a section helped. For that, the trace lab runs each task with and without the compiled skill and compares pass rate and tokens.

| Pattern | Meaning | Suggestion |
| --- | --- | --- |
| Not opened in 30 days | Dead weight | Prune |
| Shown often, rarely opened | Retrieval noise | Rewrite summary/tags |
| Opened often, rarely applied | Misleading for scope | Narrower variant |
| Applied, then corrected | Wrong for repo | Lens rule or variant op |
| Repeated misses | Gap | Create a skill (`verify` first) |
| Always pulled together | Natural unit | Composite |

Guardrails: weights corrections > agent reports > inferred; hints hidden below 5 observations; light decayed prior with exploration; per-project scope; nothing leaves the machine; raw queries off by default.

## 10. MVP and roadmap

Phase 0, the read-only inventory, is built; Phase 1 is in progress ([tasks/phase-1.md](../tasks/phase-1.md)). Phases 1–3 reach day-to-day parity with Skills Manager, each feature built on snapshots, diffs and planned deployments ([ADR-021](decisions/ADR-021-skillctx-becomes-a-skill-manager.md)). Each step replaces something the author does by hand today; project versions arrive in Phase 3 as diffs rather than waiting for section ops ([ADR-025](decisions/ADR-025-versions-targets-and-harness-adapters.md)). Phase 4 adds analytics; Phase 5 is the compiler. The compile engine design stays open; the [engine review notes](reviews/2026-10-02-engine-architecture-review.md) collect what we know so far.

| Phase | Scope | Gate to next |
| --- | --- | --- |
| 0 · Inventory (done) | Workspace init, source adapters, Indexer (realpath + content-hash dedupe), outdated check on refresh, inventory files, local web UI that also renders skill files read-only, with syntax-highlighted code ([ADR-015](decisions/ADR-015-render-skill-files-read-only.md), [ADR-018](decisions/ADR-018-syntax-highlighting-with-shiki.md), [ADR-019](decisions/ADR-019-skill-page-matches-the-library.md), [ADR-020](decisions/ADR-020-tanstack-query-for-ui-server-state.md)) | Inventory matches what's on disk across all sources on the author's machine |
| 1 · Adopt and deploy (in progress) | Library (snapshots, lockfile), adopt, import from Skills Manager, `build/`, deployment record, plan-then-apply writer, agent toggles planned per folder, symlink or copy, undeploy ([ADR-022](decisions/ADR-022-deploying-into-agent-folders.md)) | The author manages their own machine's skills through skillctx with no writes outside the record |
| 2 · Install, update, versions | Paste-to-install from git, a local folder, a ZIP or skills.sh, with a preview; update inbox; track and pin; versions with chains as diffs, 3-way rebase and conflicts in a working copy; outside-edit capture; delete and detach; orphaned upstream; the CLI skill for agents; restore a workspace on a new machine | A skill with a personal version survives 3 upstream updates |
| 3 · Projects and organize | Harness adapters with capabilities (full: Claude Code, Codex, Cursor); project registration and targets; project versions; share with repo; per-project hide; budget meter; then profiles, tags, bulk actions, publishing versions, backup push, the Skills Manager parity checklist | A project version survives an upstream update; parity checklist complete |
| 4 · Analytics | Hook-based usage capture for deployed skills, per-skill usage, pruning suggestions | Real usage data on the author's machine |
| 5 · Compile and context | Section parser, section ops as a storage format for versions, lens scope and rules, compiled skills deployed through the planner, CLI/MCP read path, section funnel, code-graph grounding | Compiled beats original in paired runs |

## 11. Risks and open questions

| Risk | Mitigation |
| --- | --- |
| skillctx overwrites a skill another tool installed | Writer only touches entries in the deployment record; foreign targets stop the plan and offer adopt (ADR-022) |
| Deploys leave stray links after a crash or a moved workspace | Plan-then-apply; record per machine; re-running deploy reconciles |
| Agents see a skill twice (Cursor reads four folders) | Planner picks the fewest folders and warns on duplicates |
| Skills Manager imports or re-syncs our links | Coexist by default; our entries are recorded; document how to switch entries over |
| Line-diff versions conflict when upstream reflows text | Conflicts in a working copy any editor or agent can resolve; last good build stays deployed; section ops in Phase 5 |
| Snapshots bloat the workspace repo | Commit lockfile and diffs; commit snapshots only when they can't be fetched again or a version or shared copy depends on them; warn on large files |
| An update breaks a project through a version chain | Rebases are proposals, resolved top-down; a conflicted version keeps its last good build |
| skillctx overwrites an edit made outside it | Builds and copies that differ from what skillctx wrote are captured before any rebuild |
| Writing harness settings damages a user's config | Only keys an adapter declares, in per-machine files, recorded and planned; malformed files and foreign values are conflicts |
| Core grows Claude-shaped assumptions | No harness names in core (CI check); a fake harness in tests; unknown capabilities take generic fallbacks |
| Harness facts change under us | Verification script per full-tier agent, re-run on harness releases; YAML overrides for paths and values |
| Parity becomes a treadmill against an active project | Parity is a short checklist of day-to-day features, not its changelog |
| Parity work copies Skills Manager's mutable-library model | Design principle 5; each feature built on snapshot → diff → build → deployment |
| Malicious upstream installed or deployed to every agent | Run installed scanners on install and on compiled output; refuse on critical |
| Installers misreport updates | Our own content hashing |
| Network use creeps beyond explicit actions | Network only for install, update check, restore, browse, push; test that scans and the UI work offline |
| Workspace leaks machine-specific paths into a shared repo | Store paths relative to `~` or project roots; per-machine values in `local.yaml` |
| Compiling drops a critical section (Phase 5) | `get` escape hatch; paired runs before each release |
| Compiled skills don't beat originals (Phase 5) | Phase 5 gate measures pass rate and tokens; ship only on a win |
| Too many skills exceed the description budget | Warn per agent before ~1%; merge sections when compiling |
| Agents don't report used/skipped | Hooks first; OTLP opt-in; inferred |
| Upstream restructures headings (Phase 5) | Section-op states; fail loudly; 3-way review |

### Open questions

- [ ] Personal tool only, or open source?
- [x] Language: TypeScript + Bun single binary ([ADR-004](decisions/ADR-004-typescript-with-bun-binary.md))
- [x] Where project overrides live: project versions always in the workspace, with a built copy shared into the repo on request (ADR-025, amending ADR-009). Phase 5 lenses keep ADR-009's opt-in.
- [x] Skills Manager integration: coexist and read it; explicit read-only import (ADR-021).
- [x] Commit built or compiled output, or regenerate it? Regenerate (ADR-021).
- [x] How skills reach agent folders: symlink by default or copy, through the deployment planner (ADR-022).
- [ ] Parity checklist: which Skills Manager features count as day-to-day? Write it when planning Phase 3.
- [x] Which agents and folders the planner supports at Phase 1: Claude Code, Codex, Cursor, Gemini CLI and OpenCode, through their user-level folders (`src/core/deploy/agents.ts`). The order to add the rest is open.
- [x] Command names for Phase 1: top-level verbs `adopt`, `deploy`, `undeploy`, `import`. Names for Phase 2 and 3 are proposed in ADR-025 and settled at Phase 2 planning.
- [x] Skills Manager presets with per-agent settings: a profile is a set of skill and version pairs applied to a target, so per-agent settings become per-agent targets (ADR-025).
- [x] How skills are customized per project: project versions as diffs in Phase 3 (ADR-025).
- [x] Harness-specific behavior: capability-based harness adapters; full tier for Claude Code, Codex and Cursor (ADR-025).
- [ ] Formats for versions, project targets and settings-key records in the lockfile and deployment record: decide at Phase 2 and 3 planning (ADR-023 rules).
- [ ] What skills.sh's API offers for search and revisions, before building the browse page.
- [ ] Skillshare adapter: listed in ADR-010 but not built in Phase 0, because no Skillshare install was available to test against. Add it when someone has one.
- [x] Project-level skill folders (`<repo>/.claude/skills` and similar): project targets in Phase 3, through harness adapters; paths verified first (ADR-025).
- [ ] Cloud storage backup: which provider first, and when?
- [ ] Phase 5: are markdown headings enough as section boundaries?
- [ ] Phase 5: success metric for the context engine (tokens, tool calls, or task results first)?
- [ ] Phase 5: default read mode, `files` or `cli`?
- [ ] Phase 5: one MCP tool surface of five operations, or two (`context`, `get`) as the engine review suggests?

## 12. Prior art

| Project | What we borrow |
| --- | --- |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | `skills-lock.json`, `.agents/skills/` as upstream |
| [gh skill](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/) | Provenance in frontmatter |
| [xingkongliang/skills-manager](https://github.com/xingkongliang/skills-manager) ("Skills Manager") | The parity target (ADR-021); presets → profiles; content-hash rules; `manage-skills` as router model |
| [udayvarmora07/skills-manager](https://github.com/udayvarmora07/skills-manager) (a different project) | Root/Consumer/Instance vocabulary; review-then-commit; eval format |
| [kentcdodds/kody](https://github.com/kentcdodds/kody) | Two-tool MCP surface; progressive disclosure; entity refs; top-2 rules; verify-first |
| [skills-mcp](https://mcpservers.org/servers/jignesh-ponamwar/skills-mcp) | list/get/get-file disclosure tiers |
| [ai-nexus](https://github.com/JSK9999/ai-nexus) | Load only 2–3 relevant rules |
| [Hermes #16852](https://github.com/NousResearch/hermes-agent/issues/16852) | Overlay layers; fail loudly on missing anchors |
| [self-learning-agent](https://github.com/daegwang/self-learning-agent) | Approved edits from session logs |
| [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp), [trace-mcp](https://github.com/nikolai-vysotskyi/trace-mcp) | Code-graph backends |
| [Tessl](https://tessl.io/registry) | Task evals per skill |
| [Anthropic authoring guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Compiled output shape |
| [SkillsBench](https://arxiv.org/abs/2602.12670), [SWE-Skills-Bench](https://arxiv.org/abs/2603.15401) | Focused bundles; paired evaluation; stack mismatch |
| [conventions-mcp](https://github.com/FedgeNo/conventions-mcp) | Global/project rules; session-start hook |
| [claude-mem](https://www.augmentcode.com/learn/claude-mem-v13-persistent-agent-memory) | Three-layer search |
| [agent-patch](https://skills.lc/narphorium/agent-patch/narphorium-agent-patch-skills-agent-patch-skill-md) | Intent descriptions for drafting fixes |
| [Skillshare](https://github.com/runkids/skillshare) | Another upstream source |
| [SkillSpector](https://github.com/nvidia/skillspector), [Snyk Agent Scan](https://labs.snyk.io/resources/agent-scan-skill-inspector/) | Scanners on output |
| [Claude Code OTel](https://code.claude.com/docs/en/monitoring-usage) | Zero-code event capture |

People asking for this: [claude-code #35319](https://github.com/anthropics/claude-code/issues/35319), [claude-code #64606](https://github.com/anthropics/claude-code/issues/64606), [skills-manager #335](https://github.com/xingkongliang/skills-manager/issues/335), [mattpocock/skills #196](https://github.com/mattpocock/skills/issues/196), [Hermes #16852](https://github.com/NousResearch/hermes-agent/issues/16852).
