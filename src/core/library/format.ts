import { safeName } from "../inventory/format.ts";
import type { Provenance } from "../provenance/types.ts";
import type { VersionedFile } from "../versioned.ts";

/**
 * The library's committed format (ADR-023). Bump LIBRARY_FORMAT only for
 * changes an older reader would misread, not for added fields.
 */
export const LIBRARY_FORMAT = 1;

/**
 * Where a snapshot's files live. `snapshots` is committed; `fetched` is
 * git-ignored because its source can be fetched again (ADR-021, ADR-023).
 */
export type SnapshotPlace = "snapshots" | "fetched";

/** One managed skill in `library/lock.json`. */
export interface LockEntry {
	/** Content hash of the snapshot (HASH_SCHEME-prefixed). */
	hash: string;
	snapshot: SnapshotPlace;
	/** `~/` path of the folder the snapshot was taken from. */
	adoptedFrom: string;
	adoptedAt: string;
	/** What the source's installers recorded, with `~/` paths. */
	provenance: Provenance[];
	/** Presets and tags from a Skills Manager import, kept for Phase 3. */
	skillsManager?: { presets: string[]; tags: string[] };
}

export interface Lockfile {
	/** Keyed by skill name. */
	skills: Record<string, LockEntry>;
}

export const LOCK_FILE: VersionedFile<Lockfile> = {
	path: "library/lock.json",
	format: LIBRARY_FORMAT,
	empty: () => ({ skills: {} }),
};

/** Workspace-relative folder holding a skill's snapshot. */
export function snapshotDir(name: string, place: SnapshotPlace): string {
	return `library/${place}/${safeName(name)}`;
}

/** Workspace-relative folder agents' deployments point at. */
export function buildDir(name: string): string {
	return `build/${safeName(name)}`;
}
