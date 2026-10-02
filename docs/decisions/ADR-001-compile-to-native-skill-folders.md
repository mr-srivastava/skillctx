# ADR-001: Compile skills into agents' native skill folders

## Status
Accepted

## Date
2026-10-02

## Context
Upstream skills load whole, wasting context and confusing selection. We need project-specific, trimmed skill content to reach Claude Code, Codex, Cursor and others without depending on any one tool. Harnesses already do progressive disclosure natively (name/description → SKILL.md → reference files).

## Decision
`skillctx build` compiles lean, project-scoped skills into the folders each harness already reads (`.claude/skills/`, `.agents/skills/`, …). A CLI/MCP read path is layered on top for retrieval and analytics.

## Alternatives Considered
### Proxy between harness and model API
- Rejected: fragile, breaks with subscription logins, security red flag, different per tool.
### MCP / CLI on demand only
- Pros: rich retrieval and analytics.
- Rejected as the backbone: depends on the agent remembering to call it and bypasses the harness's own skill selection. Kept as a layer.

## Consequences
- Works in every harness on day one, with no running service.
- In `files` read mode we cannot observe section reads directly; analytics rely on harness telemetry/hooks or `cli` mode.
- Must handle duplicates when the original skill is also installed.
