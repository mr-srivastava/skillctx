import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli/index.ts";
import {
	LOCK_FILE,
	WorkspaceBusyError,
	withWorkspaceLock,
} from "../src/core/lock.ts";
import { type Env, Workspace } from "../src/core/workspace.ts";

let tmp: string;
let ws: Workspace;
let lockPath: string;

beforeEach(() => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-lock-"));
	ws = new Workspace(path.join(tmp, "sk"));
	mkdirSync(path.join(ws.root, "local"), { recursive: true });
	lockPath = ws.resolve(LOCK_FILE);
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

/** A lock file as another process would leave it. */
const lockedBy = (pid: number) =>
	writeFileSync(lockPath, JSON.stringify({ pid, since: "earlier" }));

/** A pid that no longer belongs to a running process. */
function deadPid(): number {
	const child = Bun.spawnSync(["true"]);
	return child.pid;
}

describe("withWorkspaceLock", () => {
	test("holds the lock while running and releases it after", () => {
		const seen = withWorkspaceLock(ws, () => existsSync(lockPath));
		expect(seen).toBe(true);
		expect(existsSync(lockPath)).toBe(false);
	});

	test("releases the lock when the function throws", () => {
		expect(() =>
			withWorkspaceLock(ws, () => {
				throw new Error("boom");
			}),
		).toThrow("boom");
		expect(existsSync(lockPath)).toBe(false);
	});

	test("is re-entrant within one process, including through a symlinked root", () => {
		const alias = new Workspace(path.join(tmp, "alias"));
		symlinkSync(ws.root, alias.root);
		const result = withWorkspaceLock(ws, () =>
			withWorkspaceLock(alias, () => {
				withWorkspaceLock(ws, () => undefined);
				return existsSync(lockPath);
			}),
		);
		expect(result).toBe(true);
		expect(existsSync(lockPath)).toBe(false);
	});

	test("refuses while a live process holds it, and leaves its lock alone", () => {
		lockedBy(process.ppid);
		let ran = false;
		expect(() =>
			withWorkspaceLock(ws, () => {
				ran = true;
			}),
		).toThrow(WorkspaceBusyError);
		expect(ran).toBe(false);
		expect(existsSync(lockPath)).toBe(true);
	});

	test("takes over a lock left by a process that has exited", () => {
		lockedBy(deadPid());
		expect(withWorkspaceLock(ws, () => "ran")).toBe("ran");
		expect(existsSync(lockPath)).toBe(false);
	});

	test("an unreadable lock is busy while fresh and taken over once old", () => {
		writeFileSync(lockPath, "");
		expect(() => withWorkspaceLock(ws, () => undefined)).toThrow(
			WorkspaceBusyError,
		);
		const old = new Date(Date.now() - 60_000);
		utimesSync(lockPath, old, old);
		expect(withWorkspaceLock(ws, () => "ran")).toBe("ran");
	});
});

describe("CLI while the workspace is busy", () => {
	test("adopt is refused with the owner's pid and leaves the library alone", async () => {
		const env: Env = {
			homeDir: path.join(tmp, "home"),
			configDir: path.join(tmp, "home/.config/skillctx"),
		};
		const skill = path.join(env.homeDir, ".agents/skills/tdd");
		mkdirSync(skill, { recursive: true });
		writeFileSync(
			path.join(skill, "SKILL.md"),
			"---\nname: tdd\ndescription: tdd skill\n---\nBody.\n",
		);
		const err: string[] = [];
		const io = { out: () => {}, err: (l: string) => err.push(l) };
		await main(["init", "--home", "~/ws"], io, env);
		await main(["inventory"], io, env);

		const busyWs = new Workspace(path.join(env.homeDir, "ws"));
		writeFileSync(
			busyWs.resolve(LOCK_FILE),
			JSON.stringify({ pid: process.ppid, since: "earlier" }),
		);
		expect(await main(["adopt", "tdd"], io, env)).toBe(1);
		expect(err.at(-1)).toContain(`pid ${process.ppid}`);
		expect(existsSync(busyWs.resolve("library/lock.json"))).toBe(false);
	});
});
