# ADR-007: Integrate with, don't build, inventory/sync, memory and security scanning

## Status
Superseded by ADR-021 for skill management: skillctx installs, updates and deploys skills. Still in force for session memory (coexist) and security scanning (call existing scanners, don't build one).

## Date
2026-10-02

## Context
Community research (docs/research/community-research.md) shows visibility, sync and session memory are crowded (Skills Manager ~5.4k stars, Skillshare, claude-mem ~84k stars, SkillSpector, Snyk Agent Scan). Safe customization and usefulness feedback are nearly empty.

## Decision
Read existing installers' and managers' outputs as upstream sources; run existing scanners on compiled output; coexist with memory tools while holding only curated lens rules. Product focus: compile, patch, retrieve, measure.

## Alternatives Considered
### Full skill manager with dashboard, deploy and sync
- Rejected: crowded, incumbent with strong traction.

## Consequences
- Adapter maintenance against third-party formats (`skills-lock.json`, Skills Manager library, Skillshare).
