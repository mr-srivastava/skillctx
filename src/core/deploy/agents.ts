/**
 * Which user-level skill folders each agent reads, preferred first. Folder
 * ids are BUILTIN_ROOTS ids. Verified 2026-10 (engine review, candidate 3)
 * except where marked; Skills Manager's library is a source, never a target.
 */
export const AGENTS = [
	{ id: "claude", label: "Claude Code", folders: ["claude-code"] },
	// ~/.codex/skills is assumed: npx skills still links into it.
	{ id: "codex", label: "Codex", folders: ["agents", "codex"] },
	{
		id: "cursor",
		label: "Cursor",
		folders: ["cursor", "agents", "claude-code", "codex"],
	},
	{ id: "gemini", label: "Gemini CLI", folders: ["gemini", "agents"] },
	// Assumed: OpenCode reads only its own folder.
	{ id: "opencode", label: "OpenCode", folders: ["opencode"] },
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];

export const AGENT_IDS: readonly AgentId[] = AGENTS.map((a) => a.id);

export function isAgentId(id: string): id is AgentId {
	return (AGENT_IDS as readonly string[]).includes(id);
}

export function agentLabel(id: AgentId): string {
	return AGENTS.find((a) => a.id === id)?.label ?? id;
}

/** Folder ids an agent reads, preferred first. */
export function foldersOf(id: AgentId): readonly string[] {
	return AGENTS.find((a) => a.id === id)?.folders ?? [];
}

/** Every folder id some agent reads, in a stable order. */
export const TARGET_FOLDERS: readonly string[] = [
	...new Set(AGENTS.flatMap((a) => a.folders)),
];
