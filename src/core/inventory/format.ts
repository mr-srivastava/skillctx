import type { Skill } from "../indexer/index.ts";
import { toPortable } from "../paths.ts";
import type { Provenance, ProvenanceKind } from "../provenance/types.ts";

/**
 * The committed inventory format (ADR-014). These types are the contract
 * between whatever writes `<home>/inventory/` and whatever reads it: the CLI,
 * the UI, and later the compiler. Every file carries `"format"`; bump
 * INVENTORY_FORMAT only for changes an older reader would misread, not for
 * added fields.
 */
export const INVENTORY_FORMAT = 1;

export const SKILLS_DIR = "inventory/skills";
export const SUMMARY_FILE = "inventory/summary.json";
/** Written only by an explicit check, so plain scans never churn it. */
export const UPSTREAM_FILE = "inventory/upstream.json";
/** Timestamps live in the git-ignored cache so an unchanged machine produces no diff. */
export const LAST_SCAN_FILE = ".cache/last-scan.json";

export interface RootSummary {
	id: string;
	label: string;
	path: string;
	present: boolean;
	entries: number;
}

/** `inventory/summary.json` */
export interface InventorySummary {
	skills: number;
	copies: number;
	entries: number;
	drifted: number;
	/** Skills with a copy edited since it was installed. */
	modifiedSinceInstall: number;
	withDiagnostics: number;
	/** Skills per provenance kind; a skill counts once per kind it has. */
	sources: Partial<Record<ProvenanceKind | "untracked", number>>;
	roots: RootSummary[];
	/** Problems reading other tools' files (lockfile, databases). */
	warnings: string[];
}

/** Where one copy is visible: a root entry, possibly through a symlink. */
export interface SeenIn {
	root: string;
	/** `~/` path of the entry in that root. */
	path: string;
	symlink: boolean;
}

export interface CopyRecord {
	hash: string;
	/** `~/` path of the folder after resolving symlinks. */
	realPath: string;
	fileCount: number;
	bytes: number;
	seenIn: SeenIn[];
	installState?: "unchanged" | "modified";
	/** Paths inside are `~/` paths. */
	provenance: Provenance[];
	diagnostics: string[];
}

/** `inventory/skills/<name>.json`: one skill and all its copies. */
export interface SkillRecord {
	name: string;
	description: string;
	versions: number;
	drift: boolean;
	sources: ProvenanceKind[];
	copies: CopyRecord[];
}

/** Distinct provenance kinds across a skill's copies, sorted. */
export function sourceKinds(skill: Skill): ProvenanceKind[] {
	return [
		...new Set(skill.copies.flatMap((c) => c.provenance.map((p) => p.kind))),
	].sort();
}

/**
 * Provenance comes from other tools' files, which store absolute paths
 * (Skills Manager's source_ref, git repo roots, local remotes). Every string
 * that is an absolute path under home becomes `~/...` (ADR-009).
 */
export function portableProvenance(p: Provenance, homeDir: string): Provenance {
	return Object.fromEntries(
		Object.entries(p).map(([k, v]) => [
			k,
			typeof v === "string" && v.startsWith("/") ? toPortable(v, homeDir) : v,
		]),
	) as Provenance;
}

/** A skill name as a file or folder name; names are user-controlled, so keep them filesystem-safe. */
export function safeName(name: string): string {
	const safe = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
	return safe || "_";
}

/** File name for a skill's inventory record. */
export function skillFileName(name: string): string {
	return `${safeName(name)}.json`;
}

/** The committed shape of one skill: no absolute home paths, stable key order. */
export function toRecord(skill: Skill, homeDir: string): SkillRecord {
	return {
		name: skill.name,
		description: skill.description,
		versions: skill.versions,
		drift: skill.drift,
		sources: sourceKinds(skill),
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
			installState: c.installState,
			provenance: c.provenance.map((p) => portableProvenance(p, homeDir)),
			diagnostics: c.diagnostics,
		})),
	};
}
