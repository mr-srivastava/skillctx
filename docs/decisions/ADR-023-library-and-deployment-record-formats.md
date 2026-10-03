# ADR-023: Library and deployment record formats, and taking over other tools' entries

## Status
Accepted. Refines ADR-021 (where snapshots live) and ADR-022 (what "taking over" an entry means).

## Date
2026-10-03

## Context
Phase 1 adds adopting and deploying (ADR-021, ADR-022). Before code, three things need a concrete shape.

**Files.** ADR-021 says git-sourced snapshots live in "a git-ignored folder" and are fetched again on restore. Restore arrives in Phase 2. If those snapshots sat in `.cache/`, which is documented as safe to delete, clearing it before Phase 2 would leave builds with no source. ADR-022 puts the deployment record in "the workspace's git-ignored per-machine file", and `local.yaml` is meant for settings, not a growing list of records.

**Other tools' entries.** On the author's machine, `~/.agents/skills` holds real folders installed by npx skills, and the other agent folders hold symlinks into it. Replacing a symlink loses nothing. Replacing a real folder deletes another tool's files, which ADR-021 rules out ("never modified").

**Taking back.** A tool like `npx skills update` can rewrite an entry skillctx took over. The user chose "take over, detect, don't fight": skillctx flags it and never overwrites it silently.

## Decision

### Workspace files

```
<home>/
  library/
    lock.json              committed; one entry per managed skill
    snapshots/<name>/      committed; snapshots that can't be fetched again
    fetched/<name>/        git-ignored; snapshots that can be fetched again
  build/<name>/            git-ignored; what deployments point at
  local/deployments.json   git-ignored; the deployment record for this machine
```

- `.gitignore` gains `build/`, `library/fetched/` and `local/`. Commands that write these folders add any missing lines to an existing workspace's `.gitignore`, so workspaces made before Phase 1 are covered.
- `<name>` is the skill name made filesystem-safe, as `skillFileName` does for inventory files.

### `library/lock.json`

Versioned like the inventory (ADR-014): `"format": 1` first, readers refuse newer formats, and added fields keep the number. Keys are sorted, and paths under home are `~/` paths.

```json
{
  "format": 1,
  "skills": {
    "tdd": {
      "hash": "h2:…",
      "snapshot": "fetched",
      "adoptedFrom": "~/.agents/skills/tdd",
      "adoptedAt": "2026-10-03T10:00:00.000Z",
      "provenance": [{ "kind": "skill-lock", "…": "…" }],
      "skillsManager": { "presets": ["web"], "tags": ["react"] }
    }
  }
}
```

- `hash` is the snapshot's content hash. Adopting checks it against a fresh hash of the source folder, so a folder edited between scan and adopt is caught.
- `snapshot` is `fetched` when the copy has an upstream skillctx can fetch again (a provenance kind with an upstream check) and is unchanged since install. Otherwise it's `snapshots`, and the files are committed.
- `skillsManager` holds presets and tags from a Skills Manager import, kept for Phase 3.
- A snapshot copies exactly the files the content hash covers (`listSkillFiles`), so `.git` and `node_modules` never enter the library.

### `local/deployments.json`

Same versioning. One entry per agent-folder entry skillctx created or took over:

```json
{
  "format": 1,
  "deployments": [
    {
      "skill": "tdd",
      "folder": "~/.claude/skills",
      "entry": "~/.claude/skills/tdd",
      "mode": "symlink",
      "hash": "h2:…",
      "replaced": { "linkTarget": "~/.agents/skills/tdd" },
      "deployedAt": "2026-10-03T10:05:00.000Z"
    }
  ]
}
```

- An entry is **ours** when it is still what we wrote: a symlink to `build/<name>`, or (copy mode) a real folder whose hash matches `hash`.
- An entry in the record that isn't ours any more is **taken back**. Plans treat it as foreign: skillctx won't overwrite or remove it, and reports it.
- `replaced` records the symlink a takeover replaced. Undeploying restores it, so taking over an npx skills link and undeploying leaves the folder as npx skills left it.

### Taking over

- **A foreign symlink** can be taken over: the plan shows it, and applying needs explicit confirmation (`--replace` on the CLI).
- **A foreign real folder** is never removed or replaced in Phase 1. The plan reports it as blocked. The usual way round it is another folder the same agent reads (the planner tries those first).
- Only adopted skills can be deployed, so a takeover never loses content: the library holds a snapshot.

## Alternatives Considered

### Git-sourced snapshots in `.cache/`
- Pros: matches ADR-021's wording; no new ignored folder
- Cons: clearing the cache breaks builds until Phase 2 restore exists
- Rejected: `library/fetched/` is just as ignored and isn't documented as disposable

### The record in `local.yaml`
- Pros: one per-machine file, as ADR-009 described
- Cons: mixes settings with a growing machine-written list; YAML round-trips are noisier than JSON
- Rejected: `local/` is a folder for machine-written state; `local.yaml` stays for settings

### Allow replacing foreign real folders after confirmation
- Pros: Codex and Gemini could be reached through `~/.agents/skills` on machines where npx skills owns it
- Cons: deletes another tool's files; their lockfile then points at our link
- Rejected for Phase 1: revisit if blocked deploys turn out common

## Consequences
- Workspaces created before Phase 1 get new `.gitignore` lines the first time they adopt or deploy. That's a one-line diff for anyone who committed their workspace.
- The inventory sees deployed links as copies whose real path is under `<home>/build/`. A `skillctx` provenance kind identifies them, so they don't read as untracked copies or drift.
- On a machine where npx skills keeps real folders in `~/.agents/skills`, skillctx can't deploy into that folder. Agents that read only it get duplicate or blocked warnings instead.
