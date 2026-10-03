# ADR-021: skillctx becomes a skill manager, with safe edits, provenance and analytics

## Status
Accepted. Supersedes ADR-007 and ADR-010 where they make installing, updating, deploying or syncing a non-goal. Amends ADR-002 (diffs come before section ops). Deploying into agent folders is decided in ADR-022.

## Date
2026-10-03

## Context
ADR-007 chose not to build a skill manager, because Skills Manager (xingkongliang/skills-manager) and Skillshare already do it. ADR-010 kept Phase 0 a read-only inventory for the same reason. Phase 0 is now built: `init`, `inventory [--check]` and a local web UI over every skill on the machine.

A comparison against Skills Manager's code (docs/research/community-research.md, "Skills Manager compared with skillctx") showed the inventory alone is a read-only subset of what it offers. It does well at installing, deploying, presets, tags and backup. What it can't do comes from its design: it copies everything into one mutable library, so it only knows the provenance of skills it installed itself, and an edited skill either loses its edits on update or freezes as "diverged". It doesn't measure usage.

The user wants feature parity with Skills Manager, so people can switch without missing anything day to day, plus capabilities it lacks: cross-installer provenance, edits that survive updates, usage analytics and, later, the compiler.

## Decision
skillctx is a local skill manager for coding agents. You install, deploy and edit skills without losing upstream updates, see where every skill came from and whether it's used, and later compile project-specific skills.

Parity features are built on skillctx's own model, not copied from Skills Manager's. Skills move through plain-file stages:

```
source → snapshot → edit (diff) → build → deployment
```

- **Snapshots are immutable.** Installing or adopting a skill stores a snapshot of its files, with provenance recorded at that moment. Nothing writes into a snapshot afterwards.
- **Edits are diffs.** You edit a working copy freely, in the UI or your editor. skillctx stores the change as a diff against the snapshot. On update it applies the diff to the new snapshot with a 3-way merge; the result is clean, conflict or redundant. Section ops (ADR-002) come later as a more robust form of the same edit.
- **Skills installed by other tools are never modified.** Skills from `npx skills`, `gh skill`, Skills Manager or a plain folder stay where they are. To manage one, you adopt it: skillctx snapshots it into its library and leaves the original alone.
- **What the workspace commits.** The lockfile (source, revision and content hash per skill) and your diffs are always committed. Snapshot files are committed only for skills that can't be fetched again (a local folder, a ZIP, an adopted skill with no tracked upstream). Git-sourced snapshots live in a git-ignored folder and are fetched again on restore, verified by hash. Built output is always regenerated, never committed.
- **Skills Manager.** skillctx coexists with it by default and reads it as a source, as today. An explicit "Import from Skills Manager" adopts its library, turns presets into profiles and copies tags. skillctx never writes to `~/.skills-manager` or its database.
- **Network use** stays on explicit actions only: install, check for updates, restore, browse skills.sh, and push. No account, no server, no telemetry.

Roadmap:

| Phase | Scope |
| --- | --- |
| 0 · Inventory | Done |
| 1 · Adopt and deploy | Library, lockfile, adopt, Skills Manager import, deployment (ADR-022) |
| 2 · Install, update, edit | Install from git, a local folder or skills.sh; apply updates; edits as diffs with 3-way merge and a conflict review |
| 3 · Organize | Profiles, tags, bulk actions, project scopes, backup push, more agents |
| 4 · Analytics | Usage capture on deployed skills, per-skill usage, pruning suggestions |
| 5 · Compile and context | Section parser and ops, lenses, compiled skills, CLI and MCP read path |

## Alternatives Considered

### Stay a read-only inventory and compiler (ADR-007, ADR-010)
- Pros: smaller scope; doesn't compete with an established tool
- Cons: the inventory is a subset of Skills Manager; nothing to use day to day until the compiler exists
- Rejected: the user wants a tool people can switch to

### Copy Skills Manager's model: one mutable library
- Pros: simplest path to parity
- Cons: updates overwrite edits or freeze them; provenance only for skills it installed
- Rejected: those are the gaps skillctx exists to close

### Section ops as the only edit format (ADR-002 as written)
- Pros: edits survive reflowed upstream text
- Cons: editing waits on the section parser, which belongs to Phase 5
- Rejected for now: diffs ship editing in Phase 2; section ops follow

### Commit every snapshot to the workspace repo
- Pros: restores fully offline
- Cons: every upstream update adds a full copy to git history
- Rejected: hash-verified refetch covers git-sourced skills

## Consequences
- skillctx now writes outside its workspace, into agent folders. ADR-022 sets how.
- CLAUDE.md, the spec, README, glossary and package description change from "skill compiler" to "skill manager". Phase 0's task list (`tasks/`) becomes a historical record.
- The UI's advice to run `npx skills update` or `git pull` stays correct for skills skillctx doesn't manage; managed skills get update actions in Phase 2.
- Restoring a workspace on a new machine needs the network for git-sourced skills.
- A parity checklist, not Skills Manager's changelog, defines "parity". It is written in Phase 3 planning.
- Line diffs conflict more often than section ops when upstream reflows text. The conflict review in Phase 2 has to make those cheap to resolve.
