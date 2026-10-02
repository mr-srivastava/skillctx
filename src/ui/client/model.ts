import type {
	UpstreamReport,
	UpstreamResult,
} from "../../core/upstream/index.ts";
import type { SkillRecord } from "../data.ts";

export type Status = "outdated" | "edited" | "drift" | "warnings";

export interface Row {
	name: string;
	description: string;
	sources: string[];
	/** Agent roots (by id) the skill is visible in. */
	roots: string[];
	statuses: Status[];
	upstream: UpstreamResult[];
}

export function toRows(
	skills: SkillRecord[],
	upstream: UpstreamReport | null,
): Row[] {
	const bySkill = new Map<string, UpstreamResult[]>();
	for (const r of upstream?.results ?? []) {
		bySkill.set(r.skill, [...(bySkill.get(r.skill) ?? []), r]);
	}
	return skills.map((s) => {
		const up = bySkill.get(s.name) ?? [];
		const statuses: Status[] = [];
		if (up.some((r) => r.status === "outdated")) statuses.push("outdated");
		if (s.copies.some((c) => c.installState === "modified"))
			statuses.push("edited");
		if (s.drift) statuses.push("drift");
		if (s.copies.some((c) => c.diagnostics.length > 0))
			statuses.push("warnings");
		return {
			name: s.name,
			description: s.description,
			sources: s.sources.length > 0 ? s.sources : ["untracked"],
			roots: [
				...new Set(s.copies.flatMap((c) => c.seenIn.map((e) => e.root))),
			].sort(),
			statuses,
			upstream: up,
		};
	});
}

export interface Filters {
	query: string;
	source: string;
	root: string;
	status: Status | "";
}

export const NO_FILTERS: Filters = {
	query: "",
	source: "",
	root: "",
	status: "",
};

export function filterRows(rows: Row[], f: Filters): Row[] {
	const q = f.query.trim().toLowerCase();
	return rows.filter(
		(r) =>
			(!q ||
				r.name.toLowerCase().includes(q) ||
				r.description.toLowerCase().includes(q)) &&
			(!f.source || r.sources.includes(f.source)) &&
			(!f.root || r.roots.includes(f.root)) &&
			(!f.status || r.statuses.includes(f.status)),
	);
}

export function countBy(rows: Row[], status: Status): number {
	return rows.filter((r) => r.statuses.includes(status)).length;
}

export const STATUS_LABEL: Record<Status, string> = {
	outdated: "Outdated",
	edited: "Edited since install",
	drift: "Copies differ",
	warnings: "Warnings",
};

export const SOURCE_LABEL: Record<string, string> = {
	"skill-lock": "npx skills / gh skill",
	"gh-frontmatter": "gh skill metadata",
	"git-checkout": "git checkout",
	"skills-manager": "Skills Manager",
	"claude-plugin": "Claude plugin",
	"claude-app-synced": "Claude app",
	untracked: "Untracked",
};
