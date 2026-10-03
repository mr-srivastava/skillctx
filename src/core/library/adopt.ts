import { listSkillFiles } from "../indexer/files.ts";
import { hashFolder } from "../indexer/hash.ts";
import { type CopyRecord, safeName } from "../inventory/format.ts";
import { InventoryReader } from "../inventory/store.ts";
import { fromPortable } from "../paths.ts";
import { upstreamTarget } from "../provenance/kinds.ts";
import { ensureLayout, type Workspace, WorkspaceError } from "../workspace.ts";
import {
	buildDir,
	type LockEntry,
	type SnapshotPlace,
	snapshotDir,
} from "./format.ts";
import { putLockEntry, readLockfile } from "./store.ts";

/** Adopting can't go ahead; the message says why and what to do. */
export class AdoptError extends WorkspaceError {
	override name = "AdoptError";
}

export interface AdoptOptions {
	name: string;
	/** Index into the skill's inventory copies; defaults to the main copy. */
	copy?: number;
	/** ISO timestamp recorded as adoptedAt. */
	now: string;
}

export interface AdoptResult {
	name: string;
	/** `unchanged` when this exact snapshot was already adopted. */
	status: "adopted" | "unchanged";
	entry: LockEntry;
	/** Index of the copy that was adopted. */
	copy: number;
}

/** The copy most locations use; the first one on a tie. */
export function mainCopyIndex(copies: readonly CopyRecord[]): number {
	let best = 0;
	copies.forEach((c, i) => {
		if (c.seenIn.length > (copies[best]?.seenIn.length ?? 0)) best = i;
	});
	return best;
}

/**
 * A snapshot can be fetched again when an installer recorded an upstream we
 * know how to check and the copy hasn't been edited since install. Anything
 * else is committed, because nothing could restore it (ADR-021).
 */
export function snapshotPlace(copy: CopyRecord): SnapshotPlace {
	const fetchable =
		copy.installState === "unchanged" &&
		copy.provenance.some((p) => upstreamTarget(p) !== undefined);
	return fetchable ? "fetched" : "snapshots";
}

/**
 * Take a snapshot of one inventory copy into the library and materialize its
 * build. Reads the source, never writes to it. Uses the last inventory scan,
 * and refuses if the folder changed since then.
 */
export function adopt(
	ws: Workspace,
	homeDir: string,
	opts: AdoptOptions,
): AdoptResult {
	const record = new InventoryReader(ws).skill(opts.name);
	if (!record) {
		throw new AdoptError(
			`No skill named "${opts.name}" in the inventory. Run \`skillctx inventory\` first.`,
		);
	}
	const index = opts.copy ?? mainCopyIndex(record.copies);
	const copy = record.copies[index];
	if (!copy) {
		throw new AdoptError(
			`"${opts.name}" has ${record.copies.length} cop${record.copies.length === 1 ? "y" : "ies"}; there is no copy ${index + 1}.`,
		);
	}

	const lock = readLockfile(ws);
	const existing = lock.skills[opts.name];
	if (existing) {
		if (existing.hash === copy.hash) {
			return {
				name: opts.name,
				status: "unchanged",
				entry: existing,
				copy: index,
			};
		}
		throw new AdoptError(
			`"${opts.name}" is already in the library with different content. Updating an adopted skill arrives in Phase 2.`,
		);
	}
	const clash = Object.keys(lock.skills).find(
		(other) => safeName(other) === safeName(opts.name),
	);
	if (clash) {
		throw new AdoptError(
			`"${opts.name}" and the adopted "${clash}" would share the folder name "${safeName(opts.name)}".`,
		);
	}

	const source = fromPortable(copy.realPath, homeDir);
	let current: string;
	try {
		current = hashFolder(source).hash;
	} catch (error) {
		throw new AdoptError(
			`Cannot read ${copy.realPath}: ${(error as Error).message}`,
		);
	}
	if (current !== copy.hash) {
		throw new AdoptError(
			`${copy.realPath} changed since the last scan. Run \`skillctx inventory\` and try again.`,
		);
	}

	ensureLayout(ws);
	const place = snapshotPlace(copy);
	const files = listSkillFiles(source);
	ws.replaceFolder(snapshotDir(opts.name, place), source, files);
	const snapshot = ws.resolve(snapshotDir(opts.name, place));
	if (hashFolder(snapshot).hash !== copy.hash) {
		ws.removeFolder(snapshotDir(opts.name, place));
		throw new AdoptError(
			`${copy.realPath} changed while it was being copied. Try again.`,
		);
	}
	ws.replaceFolder(buildDir(opts.name), snapshot, files);

	const entry: LockEntry = {
		hash: copy.hash,
		snapshot: place,
		adoptedFrom: copy.realPath,
		adoptedAt: opts.now,
		provenance: copy.provenance,
	};
	putLockEntry(ws, opts.name, entry);
	return { name: opts.name, status: "adopted", entry, copy: index };
}
