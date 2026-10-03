import { lstatSync, readlinkSync } from "node:fs";
import path from "node:path";
import { hashFolder } from "../indexer/hash.ts";
import {
	readVersioned,
	type VersionedFile,
	writeVersioned,
} from "../versioned.ts";
import type { Workspace } from "../workspace.ts";

export const DEPLOY_FORMAT = 1;

export type DeployMode = "symlink" | "copy";

/** One agent-folder entry skillctx created or took over (ADR-022, ADR-023). */
export interface Deployment {
	skill: string;
	/** `~/` path of the agent folder. */
	folder: string;
	/** `~/` path of the entry inside it. */
	entry: string;
	mode: DeployMode;
	/** Content hash of what was deployed; how copy-mode entries are recognised. */
	hash: string;
	/** The foreign symlink a takeover replaced, restored on undeploy. */
	replaced?: { linkTarget: string };
	deployedAt: string;
}

export interface DeploymentRecord {
	deployments: Deployment[];
}

/** Per-machine, git-ignored: it holds paths that only mean something here. */
export const RECORD_FILE: VersionedFile<DeploymentRecord> = {
	path: "local/deployments.json",
	format: DEPLOY_FORMAT,
	empty: () => ({ deployments: [] }),
};

export function readRecord(ws: Workspace): DeploymentRecord {
	return readVersioned(ws, RECORD_FILE);
}

/** Sorted by entry path so the file is stable. */
export function writeRecord(ws: Workspace, record: DeploymentRecord): void {
	const deployments = [...record.deployments].sort((a, b) =>
		a.entry < b.entry ? -1 : a.entry > b.entry ? 1 : 0,
	);
	writeVersioned(ws, RECORD_FILE, { deployments });
}

/**
 * What an agent-folder entry is, from skillctx's point of view:
 * - `missing`: nothing there.
 * - `ours`: what we recorded writing, still as we wrote it.
 * - `ours-unrecorded`: a link to our build that the record lost track of.
 * - `taken-back`: recorded, but something else has rewritten it since.
 * - `foreign-link`: another tool's symlink; can be taken over after confirmation.
 * - `foreign-folder`: another tool's real folder or file; never touched.
 */
export type EntryState =
	| "missing"
	| "ours"
	| "ours-unrecorded"
	| "taken-back"
	| "foreign-link"
	| "foreign-folder";

/** Where a symlink points, as an absolute path; undefined if it isn't one. */
export function linkTarget(entry: string): string | undefined {
	try {
		if (!lstatSync(entry).isSymbolicLink()) return undefined;
		return path.resolve(path.dirname(entry), readlinkSync(entry));
	} catch {
		return undefined;
	}
}

/**
 * Classify the entry at `entry` (absolute). `recorded` is our record of it, if
 * any; `build` is the absolute build folder a link of ours points at.
 */
export function entryState(
	entry: string,
	recorded: Pick<Deployment, "mode" | "hash"> | undefined,
	build: string,
): EntryState {
	const stat = lstatSync(entry, { throwIfNoEntry: false });
	if (!stat) return "missing";
	const target = stat.isSymbolicLink() ? linkTarget(entry) : undefined;
	const linksToBuild = target === path.resolve(build);
	if (recorded) {
		if (recorded.mode === "symlink" && linksToBuild) return "ours";
		if (recorded.mode === "copy" && stat.isDirectory()) {
			try {
				if (hashFolder(entry).hash === recorded.hash) return "ours";
			} catch {
				// unreadable: not ours any more
			}
		}
		return "taken-back";
	}
	if (stat.isSymbolicLink())
		return linksToBuild ? "ours-unrecorded" : "foreign-link";
	return "foreign-folder";
}
