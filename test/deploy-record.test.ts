import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	entryState,
	readRecord,
	writeRecord,
} from "../src/core/deploy/record.ts";
import { hashFolder } from "../src/core/indexer/hash.ts";
import { initWorkspace, type Workspace } from "../src/core/workspace.ts";

let tmp: string;
let build: string;
let folder: string;
let ws: Workspace;

beforeEach(() => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-rec-"));
	build = path.join(tmp, "build/tdd");
	mkdirSync(build, { recursive: true });
	writeFileSync(path.join(build, "SKILL.md"), "---\nname: tdd\n---\n");
	folder = path.join(tmp, "agent");
	mkdirSync(folder);
	const home = path.join(tmp, "home");
	ws = initWorkspace("~/sk", {
		homeDir: home,
		configDir: path.join(home, ".config/skillctx"),
	}).workspace;
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const at = (name: string) => path.join(folder, name);
const link = { mode: "symlink" as const, hash: "h2:x" };

describe("entryState", () => {
	test("missing", () => {
		expect(entryState(at("tdd"), undefined, build)).toBe("missing");
		expect(entryState(at("tdd"), link, build)).toBe("missing");
	});

	test("our link, recorded or not", () => {
		symlinkSync(build, at("tdd"));
		expect(entryState(at("tdd"), link, build)).toBe("ours");
		expect(entryState(at("tdd"), undefined, build)).toBe("ours-unrecorded");
	});

	test("a relative link to our build counts", () => {
		symlinkSync("../build/tdd", at("tdd"));
		expect(entryState(at("tdd"), link, build)).toBe("ours");
	});

	test("another tool's link and folder", () => {
		const other = path.join(tmp, "other");
		mkdirSync(other);
		symlinkSync(other, at("a"));
		mkdirSync(at("b"));
		writeFileSync(at("c"), "file");
		expect(entryState(at("a"), undefined, build)).toBe("foreign-link");
		expect(entryState(at("b"), undefined, build)).toBe("foreign-folder");
		expect(entryState(at("c"), undefined, build)).toBe("foreign-folder");
	});

	test("a recorded link that now points elsewhere was taken back", () => {
		symlinkSync(path.join(tmp, "other"), at("tdd"));
		expect(entryState(at("tdd"), link, build)).toBe("taken-back");
	});

	test("a copy is ours while its content matches the record", () => {
		cpSync(build, at("tdd"), { recursive: true });
		const copy = { mode: "copy" as const, hash: hashFolder(build).hash };
		expect(entryState(at("tdd"), copy, build)).toBe("ours");
		writeFileSync(path.join(at("tdd"), "SKILL.md"), "rewritten");
		expect(entryState(at("tdd"), copy, build)).toBe("taken-back");
	});
});

describe("deployment record", () => {
	test("absent reads as empty; written sorted by entry, git-ignored folder", () => {
		expect(readRecord(ws)).toEqual({ deployments: [] });
		const d = (entry: string) => ({
			skill: "s",
			folder: "~/f",
			entry,
			mode: "symlink" as const,
			hash: "h2:x",
			deployedAt: "t",
		});
		writeRecord(ws, { deployments: [d("~/f/z"), d("~/f/a")] });
		expect(readRecord(ws).deployments.map((x) => x.entry)).toEqual([
			"~/f/a",
			"~/f/z",
		]);
		expect(readFileSync(path.join(ws.root, ".gitignore"), "utf8")).toContain(
			"local/",
		);
	});
});
