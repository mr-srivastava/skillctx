import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildDir,
	type LockEntry,
	snapshotDir,
} from "../src/core/library/format.ts";
import {
	putLockEntry,
	readLockfile,
	writeLockfile,
} from "../src/core/library/store.ts";
import { FormatError } from "../src/core/versioned.ts";
import { initWorkspace, type Workspace } from "../src/core/workspace.ts";

let tmp: string;
let ws: Workspace;

const entry = (hash: string): LockEntry => ({
	hash,
	snapshot: "snapshots",
	adoptedFrom: "~/.agents/skills/x",
	adoptedAt: "2026-10-03T00:00:00.000Z",
	provenance: [],
});

beforeEach(() => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-lib-"));
	const home = path.join(tmp, "home");
	ws = initWorkspace("~/sk", {
		homeDir: home,
		configDir: path.join(home, ".config/skillctx"),
	}).workspace;
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("lockfile", () => {
	test("an absent lockfile reads as empty", () => {
		expect(readLockfile(ws)).toEqual({ skills: {} });
	});

	test("round-trips with format first and skills sorted by name", () => {
		putLockEntry(ws, "zeta", entry("h2:z"));
		putLockEntry(ws, "alpha", entry("h2:a"));
		const text = readFileSync(path.join(ws.root, "library/lock.json"), "utf8");
		expect(
			text.startsWith('{\n  "format": 1,\n  "skills": {\n    "alpha"'),
		).toBe(true);
		expect(readLockfile(ws).skills.zeta?.hash).toBe("h2:z");
		expect(writeLockfile(ws, readLockfile(ws))).toBe(false);
	});

	test("a newer format is refused for reading and writing", () => {
		writeFileSync(
			path.join(ws.root, "library/lock.json"),
			JSON.stringify({ format: 2, skills: {} }),
		);
		expect(() => readLockfile(ws)).toThrow(FormatError);
		expect(() => putLockEntry(ws, "a", entry("h2:a"))).toThrow(/Upgrade/);
	});
});

describe("library paths", () => {
	test("folder names are filesystem-safe", () => {
		expect(snapshotDir("a/b", "fetched")).toBe("library/fetched/a_b");
		expect(buildDir("..x")).toBe("build/_x");
	});
});
