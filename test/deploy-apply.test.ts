import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	applyPlan,
	DeployError,
	planDeploy,
} from "../src/core/deploy/apply.ts";
import { readRecord } from "../src/core/deploy/record.ts";
import { hashFolder } from "../src/core/indexer/hash.ts";
import { refreshInventory } from "../src/core/inventory/refresh.ts";
import { adopt } from "../src/core/library/adopt.ts";
import { initWorkspace, type Workspace } from "../src/core/workspace.ts";

const NOW = "2026-10-03T10:00:00.000Z";
let tmp: string;
let home: string;
let ws: Workspace;
let npxCopy: string;

const at = (rel: string) => path.join(home, rel);
const confirm = { confirmTakeover: true, now: NOW };

/** npx skills keeps the real tdd in ~/.agents/skills and links it into ~/.claude/skills. */
beforeEach(async () => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-apply-"));
	home = path.join(tmp, "home");
	npxCopy = at(".agents/skills/tdd");
	mkdirSync(npxCopy, { recursive: true });
	writeFileSync(
		path.join(npxCopy, "SKILL.md"),
		"---\nname: tdd\ndescription: tdd skill\n---\nBody.\n",
	);
	mkdirSync(at(".claude/skills"), { recursive: true });
	symlinkSync(npxCopy, at(".claude/skills/tdd"));

	ws = initWorkspace("~/sk", {
		homeDir: home,
		configDir: path.join(home, ".config/skillctx"),
	}).workspace;
	await refreshInventory(ws, home, {
		check: false,
		upstream: () => {
			throw new Error("no network in tests");
		},
	});
	adopt(ws, home, { name: "tdd", now: NOW });
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const deploy = (
	agents: ("claude" | "gemini" | "codex")[],
	mode: "symlink" | "copy" = "symlink",
) => planDeploy(ws, home, { skill: "tdd", agents, mode });

describe("deploying over npx skills' link", () => {
	test("needs confirmation, then links Claude's entry to the build", () => {
		const p = deploy(["claude"]);
		expect(() =>
			applyPlan(ws, home, p, { confirmTakeover: false, now: NOW }),
		).toThrow(DeployError);
		expect(readlinkSync(at(".claude/skills/tdd"))).toBe(npxCopy);

		applyPlan(ws, home, p, confirm);
		expect(readlinkSync(at(".claude/skills/tdd"))).toBe(
			path.join(ws.root, "build/tdd"),
		);
		expect(readRecord(ws).deployments).toEqual([
			{
				skill: "tdd",
				folder: "~/.claude/skills",
				entry: "~/.claude/skills/tdd",
				mode: "symlink",
				hash: p.hash,
				replaced: { linkTarget: "~/.agents/skills/tdd" },
				deployedAt: NOW,
			},
		]);
	});

	test("deploying again keeps everything as it is", () => {
		applyPlan(ws, home, deploy(["claude"]), confirm);
		const again = deploy(["claude"]);
		expect(again.ops.map((o) => o.kind)).toEqual(["keep"]);
		expect(again.needsConfirmation).toBe(false);
	});

	test("undeploy restores npx skills' link", () => {
		applyPlan(ws, home, deploy(["claude"]), confirm);
		applyPlan(ws, home, deploy([]), confirm);
		expect(readlinkSync(at(".claude/skills/tdd"))).toBe(npxCopy);
		expect(readRecord(ws).deployments).toEqual([]);
	});

	test("npx skills' real folder is never touched", () => {
		const before = hashFolder(npxCopy).hash;
		applyPlan(ws, home, deploy(["claude", "gemini"]), confirm);
		applyPlan(ws, home, deploy([]), confirm);
		expect(lstatSync(npxCopy).isDirectory()).toBe(true);
		expect(hashFolder(npxCopy).hash).toBe(before);
	});
});

describe("other tools taking entries back", () => {
	test("a rewritten entry is forgotten, never overwritten or removed", () => {
		applyPlan(ws, home, deploy(["claude"]), confirm);
		unlinkSync(at(".claude/skills/tdd"));
		symlinkSync(npxCopy, at(".claude/skills/tdd"));

		const p = deploy([]);
		expect(p.ops.map((o) => o.kind)).toEqual(["forget"]);
		applyPlan(ws, home, p, confirm);
		expect(readlinkSync(at(".claude/skills/tdd"))).toBe(npxCopy);
		expect(readRecord(ws).deployments).toEqual([]);
	});

	test("a change between planning and applying writes nothing", () => {
		const p = deploy(["gemini"]);
		mkdirSync(at(".gemini/skills/tdd"), { recursive: true });
		expect(() => applyPlan(ws, home, p, confirm)).toThrow(
			/changed since the plan/,
		);
		expect(readRecord(ws).deployments).toEqual([]);
	});
});

describe("modes and guards", () => {
	test("copy mode writes the build's files and removes them on undeploy", () => {
		applyPlan(ws, home, deploy(["gemini"], "copy"), confirm);
		const entry = at(".gemini/skills/tdd");
		expect(lstatSync(entry).isSymbolicLink()).toBe(false);
		expect(hashFolder(entry).hash).toBe(
			readRecord(ws).deployments[0]?.hash ?? "",
		);
		applyPlan(ws, home, deploy([]), confirm);
		expect(existsSync(entry)).toBe(false);
	});

	test("the writer refuses entries outside the agent folders", () => {
		const p = deploy(["gemini"]);
		const outside = path.join(tmp, "elsewhere");
		p.ops = [
			{ kind: "create", folder: outside, entry: path.join(outside, "tdd") },
		];
		expect(() => applyPlan(ws, home, p, confirm)).toThrow(
			/outside agent folders/,
		);
		expect(existsSync(outside)).toBe(false);
	});

	test("a skill that isn't adopted can't be deployed", () => {
		expect(() =>
			planDeploy(ws, home, {
				skill: "other",
				agents: ["claude"],
				mode: "symlink",
			}),
		).toThrow(/adopt other/);
	});

	test("a cleared build folder is rebuilt from the snapshot", () => {
		rmSync(path.join(ws.root, "build"), { recursive: true });
		applyPlan(ws, home, deploy(["gemini"]), confirm);
		expect(existsSync(path.join(ws.root, "build/tdd/SKILL.md"))).toBe(true);
	});
});
