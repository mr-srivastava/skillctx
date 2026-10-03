import {
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { type Workspace, WorkspaceError } from "./workspace.ts";

/** Per-machine, so it sits in the gitignored `local/` folder. */
export const LOCK_FILE = "local/workspace.lock";

/** A lock file with no readable owner younger than this is still being written. */
const WRITING_GRACE_MS = 5000;

export class WorkspaceBusyError extends WorkspaceError {
	override name = "WorkspaceBusyError";
}

interface LockOwner {
	pid: number;
	since: string;
}

/** Workspace real paths this process holds the lock for, with nesting depth. */
const held = new Map<string, number>();

/**
 * Run `fn` holding the workspace's write lock, so the CLI, the UI server and
 * MCP never interleave writes to the lockfile, the deployment record or the
 * inventory. Re-entrant within one process. `fn` must be synchronous: the lock
 * is released when it returns, so never hold it across network calls.
 */
export function withWorkspaceLock<T>(ws: Workspace, fn: () => T): T {
	const key = realpathSync(ws.root);
	const depth = held.get(key) ?? 0;
	if (depth === 0) acquire(ws);
	held.set(key, depth + 1);
	try {
		return fn();
	} finally {
		if (depth === 0) {
			held.delete(key);
			release(ws);
		} else {
			held.set(key, depth);
		}
	}
}

function acquire(ws: Workspace): void {
	const file = ws.resolve(LOCK_FILE);
	mkdirSync(path.dirname(file), { recursive: true });
	const me: LockOwner = { pid: process.pid, since: new Date().toISOString() };
	// Two tries: the second follows removing a lock its owner left behind.
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			writeFileSync(file, `${JSON.stringify(me)}\n`, { flag: "wx" });
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
		const owner = readOwner(file);
		if (owner && isAlive(owner.pid)) throw busy(file, owner);
		if (!owner && ageMs(file) < WRITING_GRACE_MS) throw busy(file);
		// The owner died without releasing it. Two processes could both get
		// here and one remove the other's fresh lock; the window is a few
		// microseconds and only between skillctx processes on one machine.
		rmSync(file, { force: true });
	}
	throw busy(file);
}

function release(ws: Workspace): void {
	const file = ws.resolve(LOCK_FILE);
	if (readOwner(file)?.pid === process.pid) rmSync(file, { force: true });
}

function readOwner(file: string): LockOwner | undefined {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<LockOwner>;
		return typeof parsed.pid === "number"
			? { pid: parsed.pid, since: parsed.since ?? "" }
			: undefined;
	} catch {
		return undefined;
	}
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: it exists but belongs to another user.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

function ageMs(file: string): number {
	const stat = statSync(file, { throwIfNoEntry: false });
	return stat ? Date.now() - stat.mtimeMs : Number.POSITIVE_INFINITY;
}

function busy(file: string, owner?: LockOwner): WorkspaceBusyError {
	const who = owner
		? `Another skillctx process (pid ${owner.pid}, since ${owner.since})`
		: "Another skillctx process";
	return new WorkspaceBusyError(
		`${who} is changing this workspace. Try again when it finishes. If no skillctx is running, delete ${file}.`,
	);
}
