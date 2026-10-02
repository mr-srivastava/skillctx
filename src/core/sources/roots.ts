import type { SkillRoot } from "./types.ts";

/*
 * Pure data and string helpers: the browser bundle imports this file too.
 */

/**
 * User-level skill roots read by the agents we know about (verified 2026-10;
 * see docs/reviews/2026-10-02-engine-architecture-review.md, candidate 3).
 * Project-level roots are deferred (tasks/plan.md).
 */
export const BUILTIN_ROOTS: readonly SkillRoot[] = [
	{
		id: "agents",
		label: "~/.agents/skills (npx skills, Codex, Gemini, Cursor)",
		short: "Agents",
		path: "~/.agents/skills",
	},
	{
		id: "claude-code",
		label: "Claude Code",
		short: "Claude",
		path: "~/.claude/skills",
	},
	{ id: "codex", label: "Codex", short: "Codex", path: "~/.codex/skills" },
	{ id: "cursor", label: "Cursor", short: "Cursor", path: "~/.cursor/skills" },
	{
		id: "gemini",
		label: "Gemini CLI",
		short: "Gemini",
		path: "~/.gemini/skills",
	},
	{
		id: "opencode",
		label: "OpenCode",
		short: "OpenCode",
		path: "~/.config/opencode/skills",
	},
	{
		id: "skills-manager",
		label: "Skills Manager library",
		short: "Skills Mgr",
		path: "~/.skills-manager/skills",
	},
];

/** Extra roots listed under `roots:` in the workspace's skillctx.yaml. */
export function configuredRoots(paths: readonly string[]): SkillRoot[] {
	return paths.map((p) => ({
		id: `${CUSTOM_ROOT_PREFIX}${p}`,
		label: p,
		path: p,
	}));
}

/** Prefix of root ids for Claude Code plugins (one root per plugin). */
export const PLUGIN_ROOT_PREFIX = "claude-plugin:";
/** Prefix of root ids for roots listed in skillctx.yaml. */
export const CUSTOM_ROOT_PREFIX = "custom:";

/** Short column label for a root id. */
export function rootLabel(id: string): string {
	const builtin = BUILTIN_ROOTS.find((r) => r.id === id);
	if (builtin?.short) return builtin.short;
	if (id.startsWith(PLUGIN_ROOT_PREFIX))
		return id.slice(PLUGIN_ROOT_PREFIX.length).split("@")[0] ?? "Plugin";
	if (id.startsWith(CUSTOM_ROOT_PREFIX)) return id.split("/").pop() ?? id;
	return id;
}
