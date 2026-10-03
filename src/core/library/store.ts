import { readVersioned, writeVersioned } from "../versioned.ts";
import type { Workspace } from "../workspace.ts";
import { LOCK_FILE, type LockEntry, type Lockfile } from "./format.ts";

const byKey = <T>(record: Record<string, T>): Record<string, T> =>
	Object.fromEntries(
		Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	);

export function readLockfile(ws: Workspace): Lockfile {
	return readVersioned(ws, LOCK_FILE);
}

/** Write with skills sorted by name, so the committed file diffs cleanly. */
export function writeLockfile(ws: Workspace, lock: Lockfile): boolean {
	return writeVersioned(ws, LOCK_FILE, { skills: byKey(lock.skills) });
}

/** Add or replace one entry. */
export function putLockEntry(
	ws: Workspace,
	name: string,
	entry: LockEntry,
): void {
	const lock = readLockfile(ws);
	lock.skills[name] = entry;
	writeLockfile(ws, lock);
}
