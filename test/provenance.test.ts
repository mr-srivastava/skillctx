import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashFolder } from "../src/core/indexer/hash.ts";
import { portableProvenance } from "../src/core/inventory/format.ts";
import { scan } from "../src/core/inventory/scan.ts";
import { writeInventory } from "../src/core/inventory/store.ts";
import {
	claudeAppSyncedLookup,
	ghFrontmatterLookup,
	gitCheckoutLookup,
	skillLockLookup,
	skillsManagerLookup,
} from "../src/core/provenance/sources.ts";
import { type Env, initWorkspace } from "../src/core/workspace.ts";

let tmp: string;
let home: string;
let env: Env;
let warnings: string[];
const warn = (m: string) => warnings.push(m);

function skill(dir: string, name: string, frontmatterExtra = "") {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${name} skill\n${frontmatterExtra}---\nBody.\n`,
	);
	return realpathSync(dir);
}

beforeEach(() => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-prov-"));
	home = path.join(tmp, "home");
	env = { homeDir: home, configDir: path.join(home, ".config/skillctx") };
	mkdirSync(home, { recursive: true });
	warnings = [];
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("skill lockfile (npx skills / gh skill)", () => {
	test("attaches entries by folder name under ~/.agents/skills", () => {
		const real = skill(path.join(home, ".agents/skills/alpha"), "alpha");
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
						skillFolderHash: "abc123",
						installedAt: "2026-02-06T00:00:00Z",
					},
				},
			}),
		);
		const [p] = skillLockLookup(home, warn)(real);
		expect(p).toMatchObject({
			kind: "skill-lock",
			sourceUrl: "https://github.com/o/r.git",
			folderHash: "abc123",
		});
		expect(warnings).toEqual([]);
	});

	test("broken lockfile warns instead of failing", () => {
		mkdirSync(path.join(home, ".agents"), { recursive: true });
		writeFileSync(path.join(home, ".agents/.skill-lock.json"), "{ not json");
		expect(skillLockLookup(home, warn)("/nope")).toEqual([]);
		expect(warnings[0]).toContain("Could not read");
	});
});

describe("gh skill frontmatter", () => {
	const ghMeta =
		"metadata:\n  github-repo: https://github.com/o/r\n  github-ref: main\n  github-tree-sha: deadbeef\n  github-path: skills/alpha\n";

	test("reads github-* metadata", () => {
		const real = skill(path.join(tmp, "gh/alpha"), "alpha", ghMeta);
		expect(ghFrontmatterLookup(real)).toEqual([
			{
				kind: "gh-frontmatter",
				repo: "https://github.com/o/r",
				ref: "main",
				treeSha: "deadbeef",
				path: "skills/alpha",
				pinned: undefined,
			},
		]);
	});

	test("a gh-installed copy hashes the same as a plain copy", () => {
		const plain = skill(path.join(tmp, "plain/alpha"), "alpha");
		const gh = skill(path.join(tmp, "gh/alpha"), "alpha", ghMeta);
		expect(hashFolder(gh).hash).toBe(hashFolder(plain).hash);
	});

	test("other metadata still counts toward the hash", () => {
		const a = skill(path.join(tmp, "a/x"), "x", "metadata:\n  author: me\n");
		const b = skill(path.join(tmp, "b/x"), "x", "metadata:\n  author: you\n");
		expect(hashFolder(a).hash).not.toBe(hashFolder(b).hash);
	});
});

describe("git checkout", () => {
	test("records remote and HEAD for skills inside a git work tree", () => {
		const repo = path.join(home, ".understand/repo");
		const real = skill(path.join(repo, "skills/understand"), "understand");
		const run = (...args: string[]) =>
			Bun.spawnSync(["git", ...args], { cwd: repo });
		run("init", "-q", "-b", "main");
		run(
			"-c",
			"user.email=t@t",
			"-c",
			"user.name=t",
			"commit",
			"-q",
			"--allow-empty",
			"-m",
			"init",
		);
		run("remote", "add", "origin", "https://github.com/o/understand.git");
		const [p] = gitCheckoutLookup(home)(real);
		expect(p).toMatchObject({
			kind: "git-checkout",
			remote: "https://github.com/o/understand.git",
			branch: "main",
		});
		expect(p?.kind === "git-checkout" && p.head).toMatch(/^[0-9a-f]{40}$/);
	});

	test("excluded folders are skipped even inside a repo", () => {
		const ws = path.join(home, "skillctx");
		const real = skill(path.join(ws, "build"), "x");
		Bun.spawnSync(["git", "init", "-q"], { cwd: ws });
		Bun.spawnSync(
			[
				"git",
				"-c",
				"user.email=t@t",
				"-c",
				"user.name=t",
				"commit",
				"-q",
				"--allow-empty",
				"-m",
				"init",
			],
			{ cwd: ws },
		);
		expect(gitCheckoutLookup(home)(real)[0]?.kind).toBe("git-checkout");
		expect(gitCheckoutLookup(home, [ws])(real)).toEqual([]);
	});

	test("skills outside any repo get nothing", () => {
		expect(gitCheckoutLookup(home)(skill(path.join(home, "x"), "x"))).toEqual(
			[],
		);
	});
});

describe("Skills Manager", () => {
	function makeDb(columns: string) {
		mkdirSync(path.join(home, ".skills-manager"), { recursive: true });
		const db = new Database(
			path.join(home, ".skills-manager/skills-manager.db"),
		);
		db.run(`CREATE TABLE skills (${columns})`);
		return db;
	}

	test("reads provenance by central_path, read-only", () => {
		const real = skill(
			path.join(home, ".skills-manager/skills/alpha"),
			"alpha",
		);
		const db = makeDb(
			"central_path TEXT, source_type TEXT, source_ref TEXT, source_revision TEXT, remote_revision TEXT, update_status TEXT",
		);
		db.run(
			"INSERT INTO skills VALUES (?, 'import', '/x/.cursor/skills/alpha', NULL, NULL, 'up_to_date')",
			[real],
		);
		db.close();
		expect(skillsManagerLookup(home, warn)(real)).toEqual([
			{
				kind: "skills-manager",
				sourceType: "import",
				sourceRef: "/x/.cursor/skills/alpha",
				sourceRevision: undefined,
				remoteRevision: undefined,
				updateStatus: "up_to_date",
			},
		]);
	});

	test("unexpected schema warns and yields nothing", () => {
		makeDb("id TEXT").close();
		expect(skillsManagerLookup(home, warn)("/x")).toEqual([]);
		expect(warnings[0]).toContain("missing columns");
	});
});

describe("Claude app synced folder", () => {
	test("tags skills under ~/.claude/skills/synced", () => {
		const real = skill(
			path.join(home, ".claude/skills/synced/abc/docs"),
			"docs",
		);
		expect(claudeAppSyncedLookup(home)(real)).toEqual([
			{ kind: "claude-app-synced" },
		]);
	});
});

describe("scan with provenance", () => {
	test("plugins become roots, Skills Manager copies group with originals, sources are summarized", () => {
		const alpha = skill(path.join(home, ".agents/skills/alpha"), "alpha");
		mkdirSync(path.join(home, ".claude/skills"), { recursive: true });
		symlinkSync(alpha, path.join(home, ".claude/skills/alpha"));
		cpSync(alpha, path.join(home, ".skills-manager/skills/alpha"), {
			recursive: true,
		});
		skill(path.join(home, ".agents/skills/loose"), "loose");

		const pluginPath = path.join(home, ".claude/plugins/cache/p/paper/0.1.0");
		skill(path.join(pluginPath, "skills/design"), "design");
		writeFileSync(
			path.join(home, ".claude/plugins/installed_plugins.json"),
			JSON.stringify({
				version: 2,
				plugins: {
					"paper@p": [
						{ installPath: pluginPath, version: "0.1.0", gitCommitSha: "cd89" },
					],
				},
			}),
		);

		const { workspace } = initWorkspace("~/ws", env);
		const result = scan(workspace, home);
		const byName = Object.fromEntries(result.skills.map((s) => [s.name, s]));

		expect(byName.alpha?.copies.length).toBe(2);
		expect(byName.alpha?.drift).toBe(false);
		expect(byName.design?.copies[0]?.provenance).toEqual([
			{
				kind: "claude-plugin",
				plugin: "paper@p",
				version: "0.1.0",
				gitCommitSha: "cd89",
			},
		]);
		expect(result.summary.sources).toEqual({
			"claude-plugin": 1,
			untracked: 2,
		});

		writeInventory(workspace, result, home);
		const record = JSON.parse(
			readFileSync(
				path.join(workspace.root, "inventory/skills/design.json"),
				"utf8",
			),
		);
		expect(record.sources).toEqual(["claude-plugin"]);
	});
});

describe("portable provenance", () => {
	test("absolute paths under home in any field become ~/", () => {
		expect(
			portableProvenance(
				{
					kind: "skills-manager",
					sourceType: "import",
					sourceRef: path.join(home, ".cursor/skills/x"),
				},
				home,
			),
		).toEqual({
			kind: "skills-manager",
			sourceType: "import",
			sourceRef: "~/.cursor/skills/x",
		});
		expect(
			portableProvenance(
				{ kind: "git-checkout", repoRoot: "/opt/r", head: "abc" },
				home,
			),
		).toEqual({ kind: "git-checkout", repoRoot: "/opt/r", head: "abc" });
	});
});
