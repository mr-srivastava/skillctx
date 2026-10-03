import {
	cpSync,
	existsSync,
	mkdirSync,
	rmSync,
	symlinkSync,
	unlinkSync,
} from "node:fs";
import path from "node:path";
import { listSkillFiles } from "../indexer/files.ts";
import { hashFolder } from "../indexer/hash.ts";
import { safeName } from "../inventory/format.ts";
import { buildDir, snapshotDir } from "../library/format.ts";
import { readLockfile } from "../library/store.ts";
import { fromPortable, toPortable } from "../paths.ts";
import { BUILTIN_ROOTS } from "../sources/roots.ts";
import { ensureLayout, type Workspace, WorkspaceError } from "../workspace.ts";
import { type AgentId, TARGET_FOLDERS } from "./agents.ts";
import { type FolderView, type Op, type Plan, plan } from "./plan.ts";
import {
	type Deployment,
	type DeployMode,
	type EntryState,
	entryState,
	linkTarget,
	readRecord,
	writeRecord,
} from "./record.ts";

/** A deploy can't go ahead; the message says why and what to do. */
export class DeployError extends WorkspaceError {
	override name = "DeployError";
}

/** Absolute paths of the agent folders skillctx may write into, by folder id. */
export function targetFolders(homeDir: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const id of TARGET_FOLDERS) {
		const root = BUILTIN_ROOTS.find((r) => r.id === id);
		if (root) out.set(id, fromPortable(root.path, homeDir));
	}
	return out;
}

/**
 * The build an agent folder points at. Rebuilt from the snapshot when it's
 * missing (build/ is git-ignored and may have been cleared).
 */
function ensureBuild(ws: Workspace, name: string): string {
	const lock = readLockfile(ws).skills[name];
	if (!lock) {
		throw new DeployError(
			`"${name}" isn't in the library. Run \`skillctx adopt ${name}\` first.`,
		);
	}
	const build = ws.resolve(buildDir(name));
	if (existsSync(build) && hashFolder(build).hash === lock.hash) return build;
	const snapshot = ws.resolve(snapshotDir(name, lock.snapshot));
	if (!existsSync(snapshot) || hashFolder(snapshot).hash !== lock.hash) {
		throw new DeployError(
			`The snapshot of "${name}" is missing or changed. Restoring snapshots arrives in Phase 2; adopt it again for now.`,
		);
	}
	ensureLayout(ws);
	ws.replaceFolder(buildDir(name), snapshot, listSkillFiles(snapshot));
	return build;
}

export interface PlanOptions {
	skill: string;
	/** Empty to undeploy everywhere. */
	agents: readonly AgentId[];
	mode: DeployMode;
}

/** Read the disk and the record, then plan. Writes nothing except a missing build. */
export function planDeploy(
	ws: Workspace,
	homeDir: string,
	opts: PlanOptions,
): Plan {
	const undeploy = opts.agents.length === 0;
	const lock = readLockfile(ws).skills[opts.skill];
	const mine = readRecord(ws).deployments.filter((d) => d.skill === opts.skill);
	// Deploying needs the build; undeploying only needs to recognise links to it.
	const build = undeploy
		? ws.resolve(buildDir(opts.skill))
		: ensureBuild(ws, opts.skill);

	const folders: FolderView[] = [];
	for (const [id, folder] of targetFolders(homeDir)) {
		const entry = path.join(folder, safeName(opts.skill));
		const recorded = mine.find((d) => fromPortable(d.entry, homeDir) === entry);
		folders.push({
			id,
			path: folder,
			state: entryState(entry, recorded, build),
			recorded: recorded && {
				...recorded,
				replaced: recorded.replaced && {
					linkTarget: fromPortable(recorded.replaced.linkTarget, homeDir),
				},
			},
		});
	}
	return plan({
		skill: opts.skill,
		hash: lock?.hash ?? "",
		agents: opts.agents,
		mode: opts.mode,
		folders,
	});
}

/** The entry state each op needs to find before it writes. */
const EXPECTED: Record<Op["kind"], readonly EntryState[]> = {
	create: ["missing"],
	keep: ["ours"],
	recreate: ["ours", "ours-unrecorded"],
	record: ["ours-unrecorded"],
	takeover: ["foreign-link"],
	remove: ["ours", "ours-unrecorded"],
	forget: ["missing", "taken-back", "foreign-link", "foreign-folder"],
};

export interface ApplyOptions {
	/** The user confirmed replacing other tools' links (`--replace`). */
	confirmTakeover: boolean;
	now: string;
}

export interface ApplyResult {
	applied: Op[];
}

/**
 * Apply a plan from planDeploy. Every entry is checked again first: if the
 * disk changed since planning, nothing is written. Writes only to entries
 * directly inside a known agent folder, and only to entries the record owns
 * or a confirmed takeover replaces. The record is saved even if a write
 * fails part-way, so it always matches what's on disk.
 */
export function applyPlan(
	ws: Workspace,
	homeDir: string,
	p: Plan,
	opts: ApplyOptions,
): ApplyResult {
	if (p.needsConfirmation && !opts.confirmTakeover) {
		throw new DeployError(
			"This deploy replaces other tools' links. Review the plan and confirm (--replace) to go ahead.",
		);
	}
	const allowed = new Set(targetFolders(homeDir).values());
	const record = readRecord(ws);
	const recordedAt = (entry: string) =>
		record.deployments.find(
			(d) => d.skill === p.skill && fromPortable(d.entry, homeDir) === entry,
		);
	const build = p.ops.some((o) => o.kind !== "remove" && o.kind !== "forget")
		? ensureBuild(ws, p.skill)
		: ws.resolve(buildDir(p.skill));

	for (const op of p.ops) {
		if (!allowed.has(op.folder) || path.dirname(op.entry) !== op.folder) {
			throw new DeployError(
				`Refusing to write outside agent folders: ${op.entry}`,
			);
		}
		const state = entryState(op.entry, recordedAt(op.entry), build);
		if (!EXPECTED[op.kind].includes(state)) {
			throw new DeployError(
				`${toPortable(op.entry, homeDir)} changed since the plan was made. Run the command again to see a fresh plan.`,
			);
		}
	}

	const portable = (abs: string) => toPortable(abs, homeDir);
	const drop = (entry: string) => {
		record.deployments = record.deployments.filter(
			(d) => !(d.skill === p.skill && fromPortable(d.entry, homeDir) === entry),
		);
	};
	const add = (op: Op, replaced?: string) => {
		drop(op.entry);
		const d: Deployment = {
			skill: p.skill,
			folder: portable(op.folder),
			entry: portable(op.entry),
			mode: p.mode,
			hash: p.hash,
			deployedAt: opts.now,
		};
		if (replaced) d.replaced = { linkTarget: portable(replaced) };
		record.deployments.push(d);
	};
	const write = (entry: string) => {
		mkdirSync(path.dirname(entry), { recursive: true });
		if (p.mode === "symlink") symlinkSync(build, entry);
		else cpSync(build, entry, { recursive: true });
	};
	const removeOurs = (entry: string) => {
		if (linkTarget(entry) !== undefined) unlinkSync(entry);
		else rmSync(entry, { recursive: true });
	};

	const applied: Op[] = [];
	try {
		for (const op of p.ops) {
			switch (op.kind) {
				case "keep":
					break;
				case "create":
					write(op.entry);
					add(op);
					break;
				case "record":
					add(op);
					break;
				case "recreate": {
					const kept = recordedAt(op.entry)?.replaced?.linkTarget;
					removeOurs(op.entry);
					write(op.entry);
					add(op, kept && fromPortable(kept, homeDir));
					break;
				}
				case "takeover": {
					const previous = linkTarget(op.entry);
					unlinkSync(op.entry);
					write(op.entry);
					add(op, previous);
					break;
				}
				case "remove":
					removeOurs(op.entry);
					if (op.restore) symlinkSync(op.restore, op.entry);
					drop(op.entry);
					break;
				case "forget":
					drop(op.entry);
					break;
			}
			applied.push(op);
		}
	} finally {
		writeRecord(ws, record);
	}
	return { applied };
}
