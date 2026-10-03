import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli/index.ts";
import type { Env } from "../src/core/workspace.ts";

let tmp: string;
let env: Env;
let out: string[];
let err: string[];
const io = {
	out: (l: string) => out.push(l),
	err: (l: string) => err.push(l),
};

const at = (rel: string) => path.join(env.homeDir, rel);
const run = async (...argv: string[]) => {
	out = [];
	err = [];
	return main(argv, io, env);
};

beforeEach(async () => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-cli-"));
	env = {
		homeDir: path.join(tmp, "home"),
		configDir: path.join(tmp, "home/.config/skillctx"),
	};
	const npx = at(".agents/skills/tdd");
	mkdirSync(npx, { recursive: true });
	writeFileSync(
		path.join(npx, "SKILL.md"),
		"---\nname: tdd\ndescription: tdd skill\n---\nBody.\n",
	);
	mkdirSync(at(".claude/skills"), { recursive: true });
	symlinkSync(npx, at(".claude/skills/tdd"));
	await run("init", "--home", "~/sk");
	await run("inventory");
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("adopt", () => {
	test("adopts, then reports it's already there", async () => {
		expect(await run("adopt", "tdd")).toBe(0);
		expect(out[0]).toBe("Adopted tdd (copy 1) from ~/.agents/skills/tdd.");
		expect(out[1]).toContain("committed with the workspace");
		expect(await run("adopt", "tdd")).toBe(0);
		expect(out[0]).toBe(
			"tdd is already in the library (library/snapshots/tdd).",
		);
	});

	test("unknown skill exits 1; bad usage exits 2", async () => {
		expect(await run("adopt", "nope")).toBe(1);
		expect(err[0]).toContain("skillctx inventory");
		expect(await run("adopt")).toBe(2);
		expect(await run("adopt", "tdd", "--copy", "0")).toBe(2);
	});
});

describe("deploy and undeploy", () => {
	beforeEach(async () => {
		await run("adopt", "tdd");
	});

	test("a takeover shows the plan and asks for --replace", async () => {
		expect(await run("deploy", "tdd", "--agent", "claude")).toBe(1);
		expect(out).toContain(
			"  replace  ~/.claude/skills/tdd  (another tool's link to ~/.agents/skills/tdd; restored on undeploy)",
		);
		expect(err).toContain("  skillctx deploy tdd --agent claude --replace");
		expect(readlinkSync(at(".claude/skills/tdd"))).toBe(
			at(".agents/skills/tdd"),
		);
	});

	test("--dry-run never writes", async () => {
		expect(await run("deploy", "tdd", "--agent", "gemini", "--dry-run")).toBe(
			0,
		);
		expect(out).toContain("  create   ~/.gemini/skills/tdd");
		expect(await run("deploy")).toBe(0);
		expect(out).toEqual(["Nothing deployed yet."]);
	});

	test("deploy, list, undeploy round trip", async () => {
		expect(await run("deploy", "tdd", "--agent", "claude", "--replace")).toBe(
			0,
		);
		expect(out.at(-1)).toBe("Done: 1 change.");
		expect(await run("deploy")).toBe(0);
		expect(out[0]).toContain("~/.claude/skills/tdd  symlink, deployed");

		expect(await run("undeploy", "tdd")).toBe(0);
		expect(out).toContain(
			"  remove   ~/.claude/skills/tdd  (puts back the link to ~/.agents/skills/tdd)",
		);
		expect(readlinkSync(at(".claude/skills/tdd"))).toBe(
			at(".agents/skills/tdd"),
		);
	});

	test("unknown agents and a missing --agent are usage errors", async () => {
		expect(await run("deploy", "tdd", "--agent", "vim")).toBe(2);
		expect(err[0]).toContain("Unknown agent vim");
		expect(await run("deploy", "tdd")).toBe(2);
	});

	test("a skill that isn't adopted exits 1 with the command to run", async () => {
		expect(await run("deploy", "other", "--agent", "claude")).toBe(1);
		expect(err[0]).toContain("skillctx adopt other");
	});
});

describe("inventory after deploying", () => {
	const record = () =>
		JSON.parse(readFileSync(at("sk/inventory/skills/tdd.json"), "utf8")) as {
			copies: { realPath: string; provenance: Record<string, string>[] }[];
		};

	beforeEach(async () => {
		await run("adopt", "tdd");
		await run("deploy", "tdd", "--agent", "claude", "--replace");
	});

	test("the deployed copy is marked as skillctx's, and counted", async () => {
		expect(await run("inventory")).toBe(0);
		const build = record().copies.find((c) => c.realPath === "~/sk/build/tdd");
		expect(build?.provenance).toEqual([
			{ kind: "skillctx", skill: "tdd", mode: "symlink" },
		]);
		expect(out).toContain("Deployments: 1 deployed.");
	});

	test("an entry another tool rewrote is reported", async () => {
		unlinkSync(at(".claude/skills/tdd"));
		symlinkSync(at(".agents/skills/tdd"), at(".claude/skills/tdd"));
		expect(await run("inventory")).toBe(0);
		expect(out).toContain(
			"Deployments: 0 deployed, 1 taken back by another tool. Run `skillctx deploy` to see which.",
		);
		expect(await run("deploy")).toBe(0);
		expect(out[0]).toContain("taken back by another tool");
	});
});
