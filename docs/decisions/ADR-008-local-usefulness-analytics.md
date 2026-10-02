# ADR-008: Local usefulness analytics with harness telemetry and paired evals

## Status
Accepted

## Date
2026-10-02

## Context
Tools count invocations only (claude-code #35319). SWE-Skills-Bench shows most skills give no gain and some hurt. We need to know if a section helped in this project.

## Decision
Track a per-section funnel (shown → opened → applied → held up) in local SQLite. Sources: our CLI/MCP calls, Claude Code OpenTelemetry via a local collector, `PreToolUse` hooks, piggybacked `prev.used/skipped`. Validate releases with paired with/without runs in a trace lab. Nothing leaves the machine; raw queries off by default.

## Alternatives Considered
### Invocation counts only
- Rejected: can't distinguish used from useful.
### Hosted analytics
- Rejected: local-first; queries may contain code or secrets.

## Consequences
- Stats are a light, decayed ranking prior with exploration slots to avoid popularity loops.
- Hints hidden below 5 observations.
