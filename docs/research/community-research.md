# Community research: the five problems

Checked 2026-10-02. Feeds [spec.md](../spec.md).

All five problems are real, but served very unevenly. Visibility and memory are crowded; safe customization and usefulness feedback are nearly empty. Benchmarks show focused skills beat exhaustive ones, which backs the compiler directly.

| Problem | Community heat | Existing solutions | Opening for us |
| --- | --- | --- | --- |
| 1. Context pollution | High: hard budget in Claude Code, wrong-skill picks at scale | Manual splitting, fewer skills, budget settings, ai-nexus | Strong |
| 2. No memory between runs | Very high | claude-mem (~84k stars), memory/convention MCPs, `MEMORY.md` | Narrow |
| 3. No safe customization | Medium: repeated asks, no answers | Forks; Hermes overlay proposal (unbuilt); agent-patch | Strongest |
| 4. No visibility | High, security-driven | Skillshare, Skills Manager, SkillSpector, Snyk Agent Scan | None, integrate |
| 5. No feedback | Rising | Hooks, OpenTelemetry, Port, offline evals | Strong |

## 1. Context pollution

- Claude Code caps skill metadata at 1% of context (`skillListingBudgetFraction`, ~8,000 chars at 200k); over budget, least-used skills lose descriptions ([claudefa.st](https://claudefa.st/blog/guide/mechanics/skill-listing-budget)).
- A 25-skill project at 153% of budget, 56-skill at 104%; Claude ignored skills. Closed as not planned ([claude-code #64606](https://github.com/anthropics/claude-code/issues/64606)).
- PostHog (226 skills): agents "increasingly pick the wrong skill" ([PostHog](https://posthog.com/newsletter/writing-agent-skills)).

| Approach | Example | Limit |
| --- | --- | --- |
| Split by hand | Anthropic: `SKILL.md` < 500 lines, refs one level deep ([docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)) | Author discipline only |
| Skill as router | PostHog SQL skill links 26 schemas + 22 patterns | Same |
| Install fewer | Common advice | Loses knowledge |
| Raise budget | `skillListingBudgetFraction`, `SLASH_COMMAND_TOOL_CHAR_BUDGET` | More context used |
| Pre-prompt routing | [ai-nexus](https://github.com/JSK9999/ai-nexus) | Claude hook; whole rules |

What's missing: nothing reshapes someone else's skill for your project. Every fix asks the author or user to restructure by hand.

## 2. No memory between runs

- Agents start cold every session ([Cognee](https://www.cognee.ai/blog/guides/ai-coding-agent-persistent-codebase-memory)).
- Instruction files go stale silently ([Promptless](https://promptless.ai/blog/technical/agent-context-files-explained/)); `CLAUDE.md` and `AGENTS.md` drift ([gist](https://gist.github.com/yurukusa/d36197848911f025add142abefcde685)).

| Approach | Example | Limit |
| --- | --- | --- |
| Built-in memory | Claude Code `MEMORY.md` | One host; unstructured |
| Session capture | [claude-mem](https://www.augmentcode.com/learn/claude-mem-v13-persistent-agent-memory): hooks, compression, 3-layer search | No link to skills |
| Convention stores | [conventions-mcp](https://github.com/FedgeNo/conventions-mcp): FTS5 + embeddings, global/project rules, session-start hook | Rules only |
| Codebase memory MCPs | [memory-mcp](https://github.com/EtienneBBeaulac/memory-mcp), [codebase-memory](https://github.com/yuga-hashimoto/codebase-memory), [OpenMemory](https://mem0.ai/openmemory) | Free-form |
| Instructions as code | Owners, PR triggers (Promptless) | Process only |

What's missing: memory tools store loose facts and skills store general advice, and nothing connects the two. Worth borrowing are conventions-mcp's session-start hook and claude-mem's 3-layer search.

## 3. No safe customization

- Direct edits are lost on update ([OpenSkills docs](https://lzw.me/docs/opencodedocs/numman-ali/openskills/platforms/update-skills/)).
- [mattpocock/skills #196](https://github.com/mattpocock/skills/issues/196): someone asked whether updating wipes local edits. It was closed with no answer.
- Hermes: editing a bundled skill permanently stops upstream updates ([#16852](https://github.com/NousResearch/hermes-agent/issues/16852)).
- `npx skills update` bugs: [#484](https://github.com/vercel-labs/skills/issues/484), [#337](https://github.com/vercel-labs/skills/issues/337).

| Approach | Example | Limit |
| --- | --- | --- |
| Fork | Install from your fork | Manual merges |
| Overlay layers | Hermes `bundled/` + `custom/` design | Unbuilt, P3 |
| Hash detection | Skills Manager, Hermes | Overwrite or freeze |
| Semantic patches | [agent-patch](https://skills.lc/narphorium/agent-patch/narphorium-agent-patch-skills-agent-patch-skill-md) GIVEN/WHEN/THEN, LLM-applied | Non-deterministic |

What's missing: a tool that actually does this. It's the clearest gap of the five. Our section ops are deterministic like a diff but anchored on sections, so they survive reflowed text.

## 4. No visibility

- Each CLI has its own folder ([Skillshare walkthrough](https://dev.to/runkids/how-to-sync-ai-skills-across-claude-code-openclaw-and-codex-in-2-minutes-226e)); Cursor reads others' folders ([Cursor](https://cursor.com/docs/skills)).
- 67 → 183 skills in a month, no usage data ([#35319](https://github.com/anthropics/claude-code/issues/35319)).
- Snyk: of 3,984 skills, 36.8% have a security issue, 13.4% critical, 76 malicious ([Snyk Labs](https://labs.snyk.io/resources/agent-scan-skill-inspector/)).

Existing: [Skillshare](https://github.com/runkids/skillshare), [Skills Manager](https://github.com/xingkongliang/skills-manager), lockfiles, [SkillSpector](https://github.com/nvidia/skillspector), Snyk Agent Scan.

### Skills Manager compared with skillctx

Checked 2026-10-03 against [skillsmanager.dev](https://skillsmanager.dev/) and the repo at `def946d`. It's an MIT-licensed Tauri desktop app with a Rust CLI. It copies skills into a central library (`~/.skills-manager/skills`) and deploys them out to agent folders. skillctx reads skills where they already are and never writes to them.

| Feature | Skills Manager | skillctx (Phase 0) |
| --- | --- | --- |
| Agents | ~56 adapters (`tool_adapters.rs`; the site says 52), with custom global and project paths | 8 locations |
| Install | git, local folder, ZIP, skills.sh marketplace | None (non-goal) |
| Deploy | Symlink (recommended) or copy, global and per project | None; delivery of compiled output is still open |
| Presets, tags, bulk actions | Yes | No; presets will be reused as profiles |
| Backup | GitHub sign-in, auto-created private repo, merges per skill that never overwrite on conflict | Plain workspace you push yourself |
| Content hash | Yes. Ignores `.git`, `.DS_Store` and `*.pyc`; a second hash that ignores line endings is used for update checks (`content_hash.rs`) | Yes |
| Duplicates | Groups same name with the same hash, only when importing (`scanner.rs`) | Ongoing view across sources, by real path and content hash |
| Drift | Per-project status: in sync / project newer / center newer / diverged, with reset | Offline edit detection against the recorded hash |
| Updates | git and skills.sh skills checked against upstream, with a source diff | `inventory --check` for repos named in provenance |
| Provenance | Only for skills it installed itself (`source_type`: `git`, `skillssh`, `local`); skills found in agent folders become `local`/`import` | Read in place from lockfiles, `gh skill` frontmatter, git checkouts, its database, Claude plugins |
| Content view | Main document only (SKILL.md), as markdown; no editing | Every file in the skill, read-only, with Shiki highlighting |
| Compile, patches, lenses, analytics | None | Planned (Phases 1–4) |

Takeaway: it covers the management layer more fully than we should try to, and its hashing and drift handling are as good as ours or better. Its line-ending and dependency-folder rules are worth adopting. Where it can't compete is in seeing skills it didn't install: cross-tool provenance and a standing view across sources come from reading in place, and those are what the inventory should lean on.

What's missing: nothing we should own. The one useful hook is running a scanner during `build`.

## 5. No feedback

| Study | Finding |
| --- | --- |
| [SkillsBench](https://arxiv.org/abs/2602.12670) (87 tasks) | Curated skills 33.9% → 50.5% pass; focused (≤3 modules) beat exhaustive; paired runs |
| [SWE-Skills-Bench](https://arxiv.org/abs/2603.15401) (49 skills, 565 tasks) | 39/49 zero gain, avg +1.2%; 3 hurt up to 10%; tokens up to +451%; version-mismatched guidance is a key failure |

| Approach | Example | Limit |
| --- | --- | --- |
| Hooks | `PreToolUse` on Skill tool ([docs](https://code.claude.com/docs/en/hooks)) | Triggers only |
| OpenTelemetry | `CLAUDE_CODE_ENABLE_TELEMETRY=1` ([docs](https://code.claude.com/docs/en/monitoring-usage)); [claude_telemetry](https://github.com/TechNickAI/claude_telemetry) | Raw traces |
| Org dashboards | [Port](https://docs.port.io/agent-management/ai-registry/skills/skills-usage-analytics/) | Adoption, not usefulness |
| Offline evals | Tessl, `evals.json`, paired runs | Lab, not your repo |

What's missing: anything that tracks whether a section helped in a specific project.
