import { readFileSync } from "node:fs";
import path from "node:path";
import type { Provenance } from "../provenance/types.ts";
import type { SkillEntry } from "../sources/types.ts";
import { hashFolder } from "./hash.ts";
import { parseSkillMd } from "./parse.ts";

/** One physical folder (a real path) and every root entry that points at it. */
export interface SkillCopy {
	realPath: string;
	hash: string;
	fileCount: number;
	bytes: number;
	description: string;
	entries: SkillEntry[];
	diagnostics: string[];
	/** Filled in after indexing by the provenance lookups. */
	provenance: Provenance[];
}

/** All copies sharing a name. More than one distinct hash means drift. */
export interface Skill {
	name: string;
	description: string;
	copies: SkillCopy[];
	/** Number of distinct content hashes among the copies. */
	versions: number;
	drift: boolean;
}

function readCopy(
	realPath: string,
	entries: SkillEntry[],
): SkillCopy & { name: string } {
	const diagnostics: string[] = [];
	let name = path.basename(realPath);
	let description = "";
	try {
		const parsed = parseSkillMd(
			readFileSync(path.join(realPath, "SKILL.md"), "utf8"),
		);
		if (parsed.ok) {
			const fm = parsed.value.data;
			if (typeof fm.name === "string" && fm.name.trim()) name = fm.name.trim();
			else diagnostics.push("Frontmatter has no name; using the folder name");
			if (typeof fm.description === "string")
				description = fm.description.trim();
			else diagnostics.push("Frontmatter has no description");
		} else {
			diagnostics.push(parsed.error);
		}
	} catch (error) {
		diagnostics.push(`Cannot read SKILL.md: ${(error as Error).message}`);
	}

	let digest = { hash: "unreadable", fileCount: 0, bytes: 0 };
	try {
		digest = hashFolder(realPath);
	} catch (error) {
		diagnostics.push(`Cannot hash folder: ${(error as Error).message}`);
	}
	return {
		name,
		realPath,
		description,
		entries,
		diagnostics,
		provenance: [],
		...digest,
	};
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Group root entries into skills: first by real path (symlinks collapse into
 * one copy), then by skill name. Output order is deterministic.
 */
export function buildIndex(entries: readonly SkillEntry[]): Skill[] {
	const byReal = new Map<string, SkillEntry[]>();
	for (const entry of entries) {
		const list = byReal.get(entry.realPath) ?? [];
		list.push(entry);
		byReal.set(entry.realPath, list);
	}

	const byName = new Map<string, (SkillCopy & { name: string })[]>();
	for (const [realPath, list] of byReal) {
		list.sort((a, b) => byString(a.entryPath, b.entryPath));
		const copy = readCopy(realPath, list);
		const group = byName.get(copy.name) ?? [];
		group.push(copy);
		byName.set(copy.name, group);
	}

	const skills: Skill[] = [];
	for (const [name, group] of byName) {
		group.sort(
			(a, b) => byString(a.hash, b.hash) || byString(a.realPath, b.realPath),
		);
		const versions = new Set(group.map((c) => c.hash)).size;
		const copies = group.map(({ name: _name, ...copy }) => copy);
		const description = copies.find((c) => c.description)?.description ?? "";
		skills.push({ name, description, copies, versions, drift: versions > 1 });
	}
	return skills.sort((a, b) => byString(a.name, b.name));
}
