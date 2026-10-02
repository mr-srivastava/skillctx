import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SkillRoot } from "./types.ts";

/**
 * User-level skill roots read by the agents we know about (verified 2026-10;
 * see docs/reviews/2026-10-02-engine-architecture-review.md, candidate 3).
 * Project-level roots are deferred (tasks/plan.md).
 */
export const BUILTIN_ROOTS: readonly SkillRoot[] = [
	{
		id: "agents",
		label: "~/.agents/skills (npx skills, Codex, Gemini, Cursor)",
		path: "~/.agents/skills",
	},
	{ id: "claude-code", label: "Claude Code", path: "~/.claude/skills" },
	{ id: "codex", label: "Codex", path: "~/.codex/skills" },
	{ id: "cursor", label: "Cursor", path: "~/.cursor/skills" },
	{ id: "gemini", label: "Gemini CLI", path: "~/.gemini/skills" },
	{ id: "opencode", label: "OpenCode", path: "~/.config/opencode/skills" },
	{
		id: "skills-manager",
		label: "Skills Manager library",
		path: "~/.skills-manager/skills",
	},
];

/** Extra roots listed under `roots:` in the workspace's skillctx.yaml. */
export function configuredRoots(workspaceRoot: string): SkillRoot[] {
	const file = path.join(workspaceRoot, "skillctx.yaml");
	if (!existsSync(file)) return [];
	const parsed = Bun.YAML.parse(readFileSync(file, "utf8")) as {
		roots?: unknown;
	} | null;
	const roots = Array.isArray(parsed?.roots) ? parsed.roots : [];
	return roots
		.filter((r): r is string => typeof r === "string" && r.length > 0)
		.map((p) => ({ id: `custom:${p}`, label: p, path: p }));
}
