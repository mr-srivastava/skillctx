# skillctx spec

Status: draft v0.3 · 2026-10-02 · Owner: Aadarsh Srivastava
Live doc: https://claude.ai/code/artifact/2a245a34-da36-4c90-867e-1cceca1ae294
Decisions: [docs/decisions/](decisions/) · Research: [docs/research/community-research.md](research/community-research.md)

"skillctx" is a working name.

## 1. Problem and summary

skillctx is a local skill compiler. You keep installing skills the way you do now. skillctx takes those skills, applies your own tweaks and this repo's rules, and writes small project-specific skills into the folders Claude Code, Codex and Cursor already read. Later it also tracks which sections actually helped.

Five things are broken in how skills work today.

1. Skills load whole. A frontend task pulls in all of `api-and-interface-design`, database and backend sections included.
2. Agents forget. Every new session works out again how a skill applies to this codebase, and the only fix is copying the skill into the repo.
3. You can't safely customize. Edit an upstream skill and the next update overwrites it. Copy it and you stop getting updates.
4. You can't see what you have. Which skills are installed, where, at what version, is buried in hidden folders.
5. There's no feedback. Nobody knows which skills get used, which get opened and ignored, or which give bad advice.

The research ([community research](research/community-research.md)) showed these aren't equally open, and that changed the priorities.

| Problem | Evidence | Our stance |
| --- | --- | --- |
| Context pollution | Claude Code caps skill descriptions at ~1% of context; over budget, skills stop being picked. Focused skills (≤3 modules) beat exhaustive bundles in SkillsBench | Lead with the compiler |
| No safe customization | Repeated user questions with no answers; the only overlay design (Hermes) is unbuilt | Lead with patches |
| No feedback | 39 of 49 coding skills gave zero gain in SWE-Skills-Bench; tools count invocations only | Next: usefulness tracking |
| No memory between runs | Crowded: claude-mem (~84k stars), convention MCPs | Narrow: lens rules tied to sections |
| No visibility | Crowded and security-driven: Skillshare, Skills Manager, SkillSpector | Integrate, don't build |

In short, install skills with `npx skills`, `gh skill` or Skills Manager as you do today. skillctx never edits them. It layers your changes on top and writes the result where your agents look. A CLI and MCP server come later for search, code grounding and usage tracking.

## 2. Positioning and non-goals

Installing, deploying and syncing skills are solved. Plenty of tools do it well. What nobody handles is how a skill gets used inside one particular project, so that's the only layer we take on.

| Layer | Who owns it | Our role |
| --- | --- | --- |
| Publish and registry | skills.sh, GitHub, Tessl | Read provenance only |
| Install and update | `npx skills`, `gh skill` | Read lockfiles as upstream; detect changes by our own content hash |
| Library, deploy, sync | Skills Manager, Skillshare | Read their libraries; reuse presets as profiles |
| Security scanning | NVIDIA SkillSpector, Snyk Agent Scan | Run them on compiled output during `build` |
| Session memory | claude-mem, memory and convention MCPs | Coexist; we hold only curated lens rules |
| Use: compile, patch, retrieve, measure | Nobody yet | skillctx |

### Design principles

1. Never write into a skill someone else published.
2. Work through a CLI and plain files first. MCP is extra, not required.
3. Keep everything on the machine. No account, no server.
4. Ship less. Compiled skills hold only in-scope sections, ideally three modules or fewer per task. SkillsBench found focused bundles beat exhaustive ones.
5. Fix advice that doesn't match the stack. In SWE-Skills-Bench, guidance written for a different version was one of the main reasons skills made results worse. Patches and lens rules exist for this.
6. Suggest, don't rewrite. Usage data feeds suggestions you approve, never silent edits.

### Non-goals

- A skill registry or marketplace.
- Deploying skills into 50+ agent folders or syncing one library across agents.
- Session memory (capturing and replaying what an agent did).
- Our own security scanner; we call existing ones.
- Multi-device backup and sync, beyond the store being a git repo you can push.
- A hosted or multi-user service.
- Managing MCP server configs.

## 3. Packaging and user flow

skillctx is a CLI. It writes compiled skills into each agent's own skill folder, and optionally answers queries over the CLI and MCP. There's no proxy, no background daemon and no desktop app ([ADR-001](decisions/ADR-001-compile-to-native-skill-folders.md), [ADR-005](decisions/ADR-005-cli-and-local-web-ui-no-desktop-app.md)).

Harnesses already load skills in stages. They read each skill's `name` and `description`, open `SKILL.md` when one matches, and read reference files only when asked. That mechanism is fine. Upstream skills just aren't shaped for it, so the compiler reshapes them.

```
.claude/skills/api-design/        generated by skillctx build (also .agents/skills/, etc.)
  SKILL.md      sharp description + index of in-scope sections + top lens rules
  sections/     one file per in-scope section, patches applied
```

### Compiler rules

1. Stay inside the description budget. Claude Code gives all skill descriptions about 1% of context (around 8,000 characters at 200k) and quietly drops the least-used ones past that. `build` writes short descriptions that lead with when to use the skill, reports the total per agent, and warns before the limit.
2. Produce fewer skills. Merge related in-scope sections into one compiled skill instead of mirroring every upstream skill.
3. Follow Anthropic's layout guidance. `SKILL.md` stays under 500 lines, section files sit one level deep, and any file over 100 lines starts with a contents list.
4. Avoid duplicates. If the original skill is also installed in the same agent folder, offer to disable it or compile under a different name.
5. Scan before writing. If SkillSpector or Snyk Agent Scan is installed, run it on the output and refuse to write on a critical finding.
6. Keep lens rules in view. The top rules go into the compiled `SKILL.md`. For Claude Code and Codex there's also an optional session-start hook, so the rules load even when no skill triggers.

### Read modes

Set per project in `lens.yaml`.

| Mode | Compiled index points to | Analytics |
| --- | --- | --- |
| `files` (default) | `sections/*.md` files | From harness telemetry/hooks only |
| `cli` | `skillctx get section:…` commands | shown and opened events, no server |

Nothing runs in the background. The CLI starts, reads SQLite and exits. The harness starts the MCP server when it needs it. The dashboard exists only while `skillctx ui` is open, and `skillctx watch` is opt-in.

### A user's first day

```bash
npm i -g skillctx              # or npx skillctx
cd my-app && skillctx init     # detect installed skills, pick scope tags, write .skillctx/lens.yaml
skillctx build                 # compile lean skills into each agent's skill folder
# work normally in Claude Code, Codex, Cursor
skillctx status                # upstream changed? patches stale? suggestions waiting?
skillctx ui                    # occasionally: review rebases, suggestions, analytics
```

## 4. Core concepts and data model

Everything is built from sections, not whole skills.

| Concept | What it is | Entity ref | Stored where |
| --- | --- | --- | --- |
| Upstream skill | Installed by another tool, pinned by revision and content hash | `skill:vercel-react@a1b2c3` | Read in place, never copied |
| Section | Heading-delimited chunk with tags and a one-line summary | `section:api-design#frontend-contracts` | Index only |
| Variant | Personal derivative of one upstream skill, as section ops | `variant:api-design@frontend` | Personal store (git) |
| Composite | New skill assembled from sections of several skills/variants | `composite:react-data-layer` | Personal store (git) |
| Profile | Named set of skills, variants and composites for a stack | `profile:react-convex` | Personal store (git) |
| Project lens | Per-repo scope, profile, pinned sections, read mode, rules | `lens:<repo>` | `<repo>/.skillctx/lens.yaml` |
| Project patch | Section ops true only for this repo | `patch:<repo>/api-design` | `<repo>/.skillctx/patches/` |
| Lens rule | One-line fact about this repo ("we use Zod, not valibot") | `rule:<repo>/zod-validation` | Inside the lens |
| Build output | Compiled lean skill per agent | n/a | `<repo>/.claude/skills/`, `.agents/skills/`, … |
| Event | One usage signal (shown, opened, applied, corrected) | n/a | Local SQLite |

For physical files we borrow the vocabulary from udayvarmora07/skills-manager's ADR-002, `SkillRoot` → `Consumer` → `SkillInstance` → `EffectiveSkill`. Deduplicate by content hash.

Every variant, composite and section records `{source, revision, content_hash, section_anchor}`. Like `gh skill`, we also write this into frontmatter so it travels with the file.

Changes stack in three layers, like CSS: the upstream skill (never edited), then your personal variant, then the project patch. See [ADR-003](decisions/ADR-003-three-layer-storage-cascade.md).

```
~/.skillctx/
  store/            your own git repo: variants/, composites/, profiles/
  index.db          SQLite: sections, FTS index, grounding cache (rebuildable)
  events.db         SQLite: usage events (local only)
<repo>/.skillctx/   committed with the code
  lens.yaml         scope, profile, read mode, pinned sections, rules
  patches/          project-only section ops
  lock.json         exact upstream and variant hashes, for identical builds
```

## 5. Architecture

```
 Upstream (read-only)        Core (local)                    Surfaces
 ┌───────────────────┐       ┌──────────────────────────┐    ┌──────────────────┐
 │ npx skills lock   │       │ Indexer   (sections, FTS) │    │ Skill folders  ★ │
 │ gh skill          │ read  │ Skill store (git)         │serve│ CLI: skillctx    │
 │ Skills Manager    │──────▶│ Compiler ★ lens+patches   │───▶│ MCP: 5 tools     │
 │ Plain folders     │       │ Context engine            │    │ Dashboard (local)│
 └───────────────────┘       │ Event log                 │    └────────┬─────────┘
                             └──────────▲──────▲─────────┘             │
                               Project lens   Code graph          Any agent
```

The compiler is the centre of Phase 0. The context engine serves the same material on demand over CLI and MCP; every read through those paths writes to the event log.

## 6. Surfaces

CLI and MCP return identical payloads.

### Agent operations (CLI and MCP)

| Operation | CLI | Returns |
| --- | --- | --- |
| search | `skillctx search "<query>" [--project .]` | Slim index: refs, summaries, section tables, usage hints, top 2 lens rules |
| get | `skillctx get <ref>` | Full body of one section, variant or composite |
| context | `skillctx context "<task>" --project . [--budget 4000]` | Bundle: sections + lens rules + code anchors within budget |
| verify | `skillctx verify <draft-file>` | Existing items overlapping a proposed draft |
| propose | `skillctx propose <draft-file>` | Saves a draft for human review; never publishes |

All take optional `prev` (`used`, `skipped`, `why`) and `traceId`. MCP exposes exactly these five tools.

### Human operations

CLI commands: `init`, `build [--agent claude,codex]`, `status`, `check` (CI), `watch`, `sources`, `variant create`, `patch`, `rebase [--all]`, `stats`, `ui`.

### Fallback for agents without skill folders

A small stub skill or one `AGENTS.md` line tells the agent to call `skillctx context`.

### Dashboard

`skillctx ui` covers variants and rebase review (3-way diff), project lenses, the analytics funnel with a suggestions inbox, and drafts proposed by agents. It has no library, deploy or sync screens, since other tools do those.

## 7. Context assembly and grounding

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

## 8. Variants, patches and upstream rebase

Variants and project patches share one format: operations on named sections. See [ADR-002](decisions/ADR-002-section-ops-for-variants-and-patches.md).

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

A raw-diff op exists as an escape hatch.

### Rebase states

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

Funnel per section: shown → opened → applied → held up. See [ADR-008](decisions/ADR-008-local-usefulness-analytics.md).

| Event | Source | Captured by |
| --- | --- | --- |
| shown | Ref in `search`/`context` result | Layer |
| opened | `get` on ref | Layer |
| applied | Agent reports used | `prev.used` |
| skipped | Agent reports not useful | `prev.skipped` + `why` |
| corrected | You flag guidance wrong here | Dashboard / `skillctx flag` |
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

The MVP is Phase 0: read installed skills, split them into sections, apply the lens, and `build` small skills into the Claude Code and `.agents/skills` folders. That alone fixes the problem this started from.

| Phase | Scope | Gate to next |
| --- | --- | --- |
| 0 · Compile | Source adapters, section parser, lens scope + rules, build to native dirs, lock.json | Compiled beats original in paired runs |
| 1 · Patches | Section ops, five patch states, personal store repo, `check` in CI, drafted conflict fixes | Patches survive 3 upstream updates |
| 2 · Read path | CLI search/get, MCP (stdio), `cli` mode + events, dashboard v1, rebase review UI | Agents use the read path unprompted |
| 3 · Learning | Code-graph grounding, `context`, suggestions inbox, usage hints, verify/propose | n/a |

## 11. Risks and open questions

| Risk | Mitigation |
| --- | --- |
| Compiling drops a critical section | `get` escape hatch; paired runs before each release |
| Compiled skills don't beat originals | Phase 0 gate measures pass rate and tokens; ship only on a win |
| Harness doesn't pick compiled skill | Trigger-first descriptions; budget report |
| Too many compiled skills exceed description budget | Merge sections; warn before ~1% |
| Compiled + original both installed | Detect; offer disable/rename |
| Malicious upstream compiled to every agent | Scanner on output; refuse on critical |
| Installers misreport updates | Our own content hashing |
| Agents ignore read path | Index lives where harness looks; `AGENTS.md` pointer |
| Agents don't report used/skipped | OTLP + hooks; piggyback; inferred |
| Upstream restructures headings | Five states; fail loudly; 3-way review |
| Grounding cache stale | Invalidate by file hash |
| Scope creep into manager/memory tool | Non-goals; read-only adapters |

### Open questions

- [ ] Personal tool only, or open source?
- [ ] Are markdown headings enough as section boundaries?
- [x] Language: TypeScript + Bun single binary ([ADR-004](decisions/ADR-004-typescript-with-bun-binary.md))
- [ ] Success metric for the context engine: tokens, tool calls, or task results first?
- [ ] Lens files committed for the team, or per developer?
- [ ] Skills Manager integration: read disk, or only its `--json` CLI?
- [ ] Commit build output, or regenerate on checkout?
- [ ] Default read mode: `files` or `cli`?
- [ ] First `build` targets: Claude Code + `.agents/skills` only, or Cursor too?

## 12. Prior art

| Project | What we borrow |
| --- | --- |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | `skills-lock.json`, `.agents/skills/` as upstream |
| [gh skill](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/) | Provenance in frontmatter |
| [xingkongliang/skills-manager](https://github.com/xingkongliang/skills-manager) | Library as upstream; presets → profiles; `manage-skills` as router model |
| [udayvarmora07/skills-manager](https://github.com/udayvarmora07/skills-manager) | Root/Consumer/Instance vocabulary; review-then-commit; eval format |
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
