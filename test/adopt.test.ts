import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { gitTreeSha } from "../src/core/indexer/git-tree.ts";
import { hashFolder } from "../src/core/indexer/hash.ts";
import { refreshInventory } from "../src/core/inventory/refresh.ts";
import { AdoptError, adopt } from "../src/core/library/adopt.ts";
import { readLockfile } from "../src/core/library/store.ts";
import { initWorkspace, type Workspace } from "../src/core/workspace.ts";

const NOW = "2026-10-03T10:00:00.000Z";
let tmp: string;
let home: string;
let ws: Workspace;

function skill(dir: string, name: string, body = "Body.\n") {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${name} skill\n---\n${body}`,
	);
	return dir;
}

async function scan() {
	await refreshInventory(ws, home, {
		check: false,
		upstream: () => {
			throw new Error("no network in tests");
		},
	});
}

/**
 * alpha: installed by npx skills, unchanged, so it can be fetched again.
 * beta: untracked. gamma: two versions, the main one linked from two roots.
 */
beforeEach(async () => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-adopt-"));
	home = path.join(tmp, "home");
	const agents = path.join(home, ".agents/skills");
	const alpha = skill(path.join(agents, "alpha"), "alpha");
	mkdirSync(path.join(alpha, "node_modules/x"), { recursive: true });
	writeFileSync(path.join(alpha, "node_modules/x/i.js"), "x");
	writeFileSync(path.join(alpha, "ref.md"), "ref\n");
	writeFileSync(
		path.join(home, ".agents/.skill-lock.json"),
		JSON.stringify({
			version: 3,
			skills: {
				alpha: {
					source: "o/r",
					sourceType: "github",
					sourceUrl: "https://github.com/o/r.git",
					skillPath: "skills/alpha/SKILL.md",
					skillFolderHash: gitTreeSha(alpha),
				},
			},
		}),
	);
	skill(path.join(agents, "beta"), "beta");
	skill(path.join(agents, "gamma"), "gamma");
	mkdirSync(path.join(home, ".cursor/skills"), { recursive: true });
	symlinkSync(
		path.join(agents, "gamma"),
		path.join(home, ".cursor/skills/gamma"),
	);
	skill(path.join(home, ".gemini/skills/gamma"), "gamma", "Edited.\n");

	ws = initWorkspace("~/sk", {
		homeDir: home,
		configDir: path.join(home, ".config/skillctx"),
	}).workspace;
	await scan();
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const lib = (rel: string) => path.join(ws.root, rel);

describe("adopt", () => {
	test("an unchanged npx skills install is snapshotted to fetched/ and built", () => {
		const result = adopt(ws, home, { name: "alpha", now: NOW });
		expect(result.status).toBe("adopted");
		expect(result.entry).toMatchObject({
			snapshot: "fetched",
			adoptedFrom: "~/.agents/skills/alpha",
			adoptedAt: NOW,
		});
		expect(result.entry.provenance[0]?.kind).toBe("skill-lock");
		const snap = lib("library/fetched/alpha");
		expect(hashFolder(snap).hash).toBe(result.entry.hash);
		expect(existsSync(path.join(snap, "node_modules"))).toBe(false);
		expect(readFileSync(lib("build/alpha/ref.md"), "utf8")).toBe("ref\n");
		expect(readLockfile(ws).skills.alpha?.hash).toBe(result.entry.hash);
	});

	test("an untracked skill is committed under snapshots/", () => {
		const { entry } = adopt(ws, home, { name: "beta", now: NOW });
		expect(entry.snapshot).toBe("snapshots");
		expect(existsSync(lib("library/snapshots/beta/SKILL.md"))).toBe(true);
	});

	test("the source folder is never modified", () => {
		const src = path.join(home, ".agents/skills/alpha");
		const before = hashFolder(src).hash;
		adopt(ws, home, { name: "alpha", now: NOW });
		expect(hashFolder(src).hash).toBe(before);
		expect(existsSync(path.join(src, "node_modules/x/i.js"))).toBe(true);
	});

	test("a drifted skill takes the copy most locations use unless told otherwise", () => {
		const main = adopt(ws, home, { name: "gamma", now: NOW });
		expect(main.entry.adoptedFrom).toBe("~/.agents/skills/gamma");
		rmSync(lib("library"), { recursive: true });
		const other = adopt(ws, home, {
			name: "gamma",
			copy: main.copy === 0 ? 1 : 0,
			now: NOW,
		});
		expect(other.entry.adoptedFrom).toBe("~/.gemini/skills/gamma");
	});

	test("adopting the same content again changes nothing", () => {
		adopt(ws, home, { name: "beta", now: NOW });
		const again = adopt(ws, home, { name: "beta", now: "later" });
		expect(again.status).toBe("unchanged");
		expect(again.entry.adoptedAt).toBe(NOW);
	});

	test("different content for an adopted name is refused", async () => {
		adopt(ws, home, { name: "beta", now: NOW });
		writeFileSync(path.join(home, ".agents/skills/beta/extra.md"), "new\n");
		await scan();
		expect(() => adopt(ws, home, { name: "beta", now: NOW })).toThrow(
			/Phase 2/,
		);
	});

	test("a folder edited since the last scan is refused", () => {
		writeFileSync(path.join(home, ".agents/skills/beta/extra.md"), "new\n");
		expect(() => adopt(ws, home, { name: "beta", now: NOW })).toThrow(
			/changed since the last scan/,
		);
		expect(existsSync(lib("library/snapshots/beta"))).toBe(false);
	});

	test("unknown skills and copies are explained", () => {
		expect(() => adopt(ws, home, { name: "nope", now: NOW })).toThrow(
			AdoptError,
		);
		expect(() => adopt(ws, home, { name: "beta", copy: 3, now: NOW })).toThrow(
			/no copy 4/,
		);
	});
});
