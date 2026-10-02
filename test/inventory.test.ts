import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli/index.ts";
import { hashFolder } from "../src/core/indexer/hash.ts";
import { buildIndex } from "../src/core/indexer/index.ts";
import { parseSkillMd } from "../src/core/indexer/parse.ts";
import { scan, skillFileName, writeInventory } from "../src/core/inventory.ts";
import { listPlainSkills } from "../src/core/sources/plain.ts";
import { BUILTIN_ROOTS } from "../src/core/sources/roots.ts";
import { type Env, initWorkspace } from "../src/core/workspace.ts";

let tmp: string;
let env: Env;
let home: string;

function skill(
	dir: string,
	name: string,
	body = "Body.\n",
	extra: Record<string, string> = {},
) {
	mkdirSync(dir, { recursive: true });
	const fm = Object.entries({ name, description: `${name} skill`, ...extra })
		.map(([k, v]) => `${k}: ${v}`)
		.join("\n");
	writeFileSync(path.join(dir, "SKILL.md"), `---\n${fm}\n---\n${body}`);
}

/**
 * A home directory shaped like the author's machine: real copies in
 * ~/.agents/skills, agent roots made of symlinks, a byte copy, an edited copy,
 * a broken skill, a symlink loop, a nested grouping folder and a dot-folder.
 */
function buildHome() {
	const agents = path.join(home, ".agents/skills");
	skill(path.join(agents, "alpha"), "alpha");
	writeFileSync(path.join(agents, "alpha/reference.md"), "ref\n");
	skill(path.join(agents, "beta"), "beta");
	mkdirSync(path.join(agents, "bad"));
	writeFileSync(path.join(agents, "bad/SKILL.md"), "no frontmatter here\n");
	skill(path.join(agents, ".trash/old"), "old");
	mkdirSync(path.join(agents, "group"));
	symlinkSync(path.join(agents, "group"), path.join(agents, "group/loop"));

	const claude = path.join(home, ".claude/skills");
	mkdirSync(claude, { recursive: true });
	symlinkSync(path.join(agents, "alpha"), path.join(claude, "alpha"));
	symlinkSync(path.join(agents, "beta"), path.join(claude, "beta"));
	skill(path.join(claude, "synced/gamma"), "gamma");

	const cursor = path.join(home, ".cursor/skills");
	mkdirSync(cursor, { recursive: true });
	cpSync(path.join(agents, "alpha"), path.join(cursor, "alpha"), {
		recursive: true,
	});

	skill(path.join(home, ".gemini/skills/beta"), "beta", "Edited body.\n");
}

beforeEach(() => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-inv-"));
	home = path.join(tmp, "home");
	env = { homeDir: home, configDir: path.join(home, ".config/skillctx") };
	mkdirSync(home, { recursive: true });
	buildHome();
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("listPlainSkills", () => {
	test("finds skills through symlinks, nested folders, and skips dot-folders and loops", () => {
		const entries = listPlainSkills(BUILTIN_ROOTS, home);
		const seen = entries
			.map((e) => `${e.rootId}:${path.relative(home, e.entryPath)}`)
			.sort();
		expect(seen).toEqual([
			"agents:.agents/skills/alpha",
			"agents:.agents/skills/bad",
			"agents:.agents/skills/beta",
			"claude-code:.claude/skills/alpha",
			"claude-code:.claude/skills/beta",
			"claude-code:.claude/skills/synced/gamma",
			"cursor:.cursor/skills/alpha",
			"gemini:.gemini/skills/beta",
		]);
		const claudeAlpha = entries.find((e) =>
			e.entryPath.endsWith(".claude/skills/alpha"),
		);
		expect(claudeAlpha?.viaSymlink).toBe(true);
		expect(claudeAlpha?.realPath).toBe(
			entries.find((e) => e.entryPath.endsWith(".agents/skills/alpha"))
				?.realPath,
		);
	});
});

describe("indexer", () => {
	test("parses frontmatter and reports missing frontmatter", () => {
		expect(parseSkillMd("---\nname: a\n---\nhi").ok).toBe(true);
		expect(parseSkillMd("hi").ok).toBe(false);
	});

	test("hash is stable and ignores provenance keys", () => {
		const a = path.join(tmp, "a");
		const b = path.join(tmp, "b");
		skill(a, "x");
		skill(b, "x", "Body.\n", { source: "github.com/o/r" });
		const keys = new Set(["source"]);
		expect(hashFolder(a, keys).hash).toBe(hashFolder(a, keys).hash);
		expect(hashFolder(a, keys).hash).toBe(hashFolder(b, keys).hash);
		expect(hashFolder(a).hash).not.toBe(hashFolder(b).hash);
	});

	test("symlinks collapse, byte copies share a hash, edited copies are drift", () => {
		const skills = buildIndex(listPlainSkills(BUILTIN_ROOTS, home));
		const byName = Object.fromEntries(skills.map((s) => [s.name, s]));

		const alpha = byName.alpha;
		expect(alpha?.copies.length).toBe(2); // ~/.agents (+ claude symlink) and the cursor byte copy
		expect(alpha?.versions).toBe(1);
		expect(alpha?.drift).toBe(false);
		expect(alpha?.copies.flatMap((c) => c.entries).length).toBe(3);

		expect(byName.beta?.versions).toBe(2);
		expect(byName.beta?.drift).toBe(true);

		expect(byName.bad?.copies[0]?.diagnostics[0]).toContain(
			"no YAML frontmatter",
		);
		expect(byName.gamma).toBeDefined();
		expect(byName.old).toBeUndefined();
	});
});

describe("inventory files", () => {
	test("writes one portable file per skill and a summary; a second run changes nothing", async () => {
		const { workspace } = initWorkspace("~/ws", env);
		const first = writeInventory(workspace, scan(workspace, home), home);
		expect(first.written).toBe(4);

		const files = readdirSync(
			path.join(workspace.root, "inventory/skills"),
		).sort();
		expect(files).toEqual([
			"alpha.json",
			"bad.json",
			"beta.json",
			"gamma.json",
		]);
		for (const f of [
			...files.map((name) => `inventory/skills/${name}`),
			"inventory/summary.json",
		]) {
			expect(readFileSync(path.join(workspace.root, f), "utf8")).not.toContain(
				home,
			);
		}

		const alpha = JSON.parse(
			readFileSync(
				path.join(workspace.root, "inventory/skills/alpha.json"),
				"utf8",
			),
		);
		expect(
			alpha.copies[0].seenIn.map((s: { path: string }) => s.path),
		).toContain("~/.claude/skills/alpha");

		const second = writeInventory(workspace, scan(workspace, home), home);
		expect(second).toEqual({ written: 0, unchanged: 4, removed: 0 });
	});

	test("removes files for skills that disappeared", () => {
		const { workspace } = initWorkspace("~/ws", env);
		writeInventory(workspace, scan(workspace, home), home);
		rmSync(path.join(home, ".claude/skills/synced"), { recursive: true });
		expect(writeInventory(workspace, scan(workspace, home), home).removed).toBe(
			1,
		);
	});

	test("unsafe skill names become safe file names", () => {
		expect(skillFileName("a/b:c")).toBe("a_b_c.json");
		expect(skillFileName("../x")).toBe("__x.json");
	});

	test("cli: inventory prints per-root counts", async () => {
		await main(
			["init", "--home", "~/ws"],
			{ out: () => {}, err: () => {} },
			env,
		);
		const out: string[] = [];
		const code = await main(
			["inventory"],
			{ out: (l) => out.push(l), err: (l) => out.push(l) },
			env,
		);
		expect(code).toBe(0);
		expect(out.join("\n")).toContain("4 skills, 6 distinct folders on disk.");
		expect(out.join("\n")).toContain(
			"1 skills have copies with different content",
		);
	});
});
