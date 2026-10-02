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
export function configuredRoots(paths: readonly string[]): SkillRoot[] {
	return paths.map((p) => ({ id: `custom:${p}`, label: p, path: p }));
}
