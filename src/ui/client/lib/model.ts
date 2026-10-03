import type {
	CopyRecord,
	SkillRecord,
	UpstreamReport,
	UpstreamResult,
} from "@/lib/core";

/**
 * Something about a skill worth a reader's attention, in the order they're
 * listed. How each looks is STATUS in components/status.tsx.
 */
export const STATUSES = ["outdated", "edited", "drift", "warnings"] as const;

export type Status = (typeof STATUSES)[number];

/** How a skill shows up in one location. */
export type Presence = "folder" | "link" | "differs" | "absent";

export interface Row {
	name: string;
	description: string;
	sources: string[];
	/** Location ids (roots) the skill is visible in. */
	roots: string[];
	/** Presence per location id. */
	presence: Record<string, Presence>;
	statuses: Status[];
	upstream: UpstreamResult[];
}

/** The copy most locations point at counts as the main one. */
export function mainCopy(s: SkillRecord): CopyRecord | undefined {
	return [...s.copies].sort((a, b) => b.seenIn.length - a.seenIn.length)[0];
}

/**
 * How one copy shows up in each location that holds it: "differs" when its
 * content isn't the main copy's.
 */
export function copyPresence(
	s: SkillRecord,
	copy: CopyRecord,
	main = mainCopy(s),
	out: Record<string, Presence> = {},
): Record<string, Presence> {
	const differs = copy.hash !== main?.hash;
	for (const e of copy.seenIn) {
		const here: Presence = differs ? "differs" : e.symlink ? "link" : "folder";
		const prev = out[e.root];
		// A real folder or a differing copy says more than a symlink.
		if (!prev || prev === "link") out[e.root] = here;
	}
	return out;
}

/** Every location's presence, across all copies of the skill. */
function presenceOf(s: SkillRecord): Record<string, Presence> {
	const main = mainCopy(s);
	const out: Record<string, Presence> = {};
	for (const copy of s.copies) copyPresence(s, copy, main, out);
	return out;
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
		const presence = presenceOf(s);
		return {
			name: s.name,
			description: s.description,
			sources: s.sources.length > 0 ? s.sources : ["untracked"],
			roots: Object.keys(presence).sort(),
			presence,
			statuses,
			upstream: up,
		};
	});
}

export type Sort = "attention" | "name";

export interface Filters {
	query: string;
	source: string;
	root: string;
	status: Status | "";
	sort: Sort;
}

export const NO_FILTERS: Filters = {
	query: "",
	source: "",
	root: "",
	status: "",
	sort: "attention",
};

const WEIGHT: Record<Status, number> = {
	outdated: 8,
	drift: 4,
	edited: 2,
	warnings: 1,
};

function attention(r: Row): number {
	return r.statuses.reduce((n, s) => n + WEIGHT[s], 0);
}

export function filterRows(rows: Row[], f: Filters): Row[] {
	const q = f.query.trim().toLowerCase();
	const out = rows.filter(
		(r) =>
			(!q ||
				r.name.toLowerCase().includes(q) ||
				r.description.toLowerCase().includes(q)) &&
			(!f.source || r.sources.includes(f.source)) &&
			(!f.root || r.roots.includes(f.root)) &&
			(!f.status || r.statuses.includes(f.status)),
	);
	return f.sort === "attention"
		? [...out].sort(
				(a, b) => attention(b) - attention(a) || a.name.localeCompare(b.name),
			)
		: out;
}

export function countBy(rows: Row[], status: Status): number {
	return rows.filter((r) => r.statuses.includes(status)).length;
}
