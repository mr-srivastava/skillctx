import { buildIndex, type Skill } from "./indexer/index.ts";
import { toPortable } from "./paths.ts";
import { listPlainSkills } from "./sources/plain.ts";
import { BUILTIN_ROOTS, configuredRoots } from "./sources/roots.ts";
import type { SkillRoot } from "./sources/types.ts";
import type { Workspace } from "./workspace.ts";

export const SKILLS_DIR = "inventory/skills";
export const SUMMARY_FILE = "inventory/summary.json";
export const LAST_SCAN_FILE = ".cache/last-scan.json";

export interface RootSummary {
	id: string;
	label: string;
	path: string;
	present: boolean;
	entries: number;
}

export interface InventorySummary {
	skills: number;
	copies: number;
	entries: number;
	drifted: number;
	withDiagnostics: number;
	roots: RootSummary[];
}

export interface ScanResult {
	skills: Skill[];
	summary: InventorySummary;
}

export function scan(ws: Workspace, homeDir: string): ScanResult {
	const roots: SkillRoot[] = [...BUILTIN_ROOTS, ...configuredRoots(ws.root)];
	const entries = listPlainSkills(roots, homeDir);
	const skills = buildIndex(entries);

	const perRoot = new Map<string, number>();
	for (const e of entries)
		perRoot.set(e.rootId, (perRoot.get(e.rootId) ?? 0) + 1);

	const summary: InventorySummary = {
		skills: skills.length,
		copies: skills.reduce((n, s) => n + s.copies.length, 0),
		entries: entries.length,
		drifted: skills.filter((s) => s.drift).length,
		withDiagnostics: skills.filter((s) =>
			s.copies.some((c) => c.diagnostics.length > 0),
		).length,
		roots: roots.map((r) => ({
			id: r.id,
			label: r.label,
			path: r.path,
			present: perRoot.has(r.id),
			entries: perRoot.get(r.id) ?? 0,
		})),
	};
	return { skills, summary };
}

/** File name for a skill's inventory record; names are user-controlled, so keep it filesystem-safe. */
export function skillFileName(name: string): string {
	const safe = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
	return `${safe || "_"}.json`;
}

/** The committed shape of one skill: no absolute home paths, stable key order. */
export function toRecord(skill: Skill, homeDir: string) {
	return {
		name: skill.name,
		description: skill.description,
		versions: skill.versions,
		drift: skill.drift,
		copies: skill.copies.map((c) => ({
			hash: c.hash,
			realPath: toPortable(c.realPath, homeDir),
			fileCount: c.fileCount,
			bytes: c.bytes,
			seenIn: c.entries.map((e) => ({
				root: e.rootId,
				path: toPortable(e.entryPath, homeDir),
				symlink: e.viaSymlink,
			})),
			diagnostics: c.diagnostics,
		})),
	};
}

function json(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

export interface WriteResult {
	written: number;
	unchanged: number;
	removed: number;
}

/** Write one file per skill plus a summary. Files for vanished skills are removed. */
export function writeInventory(
	ws: Workspace,
	result: ScanResult,
	homeDir: string,
): WriteResult {
	const out: WriteResult = { written: 0, unchanged: 0, removed: 0 };
	const keep = new Set<string>();

	for (const skill of result.skills) {
		let file = skillFileName(skill.name);
		if (keep.has(file))
			file = file.replace(
				/\.json$/,
				`-${skill.copies[0]?.hash.slice(3, 11)}.json`,
			);
		keep.add(file);
		if (ws.write(`${SKILLS_DIR}/${file}`, json(toRecord(skill, homeDir))))
			out.written++;
		else out.unchanged++;
	}
	for (const file of ws.list(SKILLS_DIR)) {
		if (
			file.endsWith(".json") &&
			!keep.has(file) &&
			ws.remove(`${SKILLS_DIR}/${file}`)
		)
			out.removed++;
	}

	ws.write(SUMMARY_FILE, json(result.summary));
	// Timestamps live in the git-ignored cache so an unchanged machine produces no diff.
	ws.write(LAST_SCAN_FILE, json({ scannedAt: new Date().toISOString() }));
	return out;
}
