import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { inventoryCommand } from "../src/cli/commands/inventory.ts";
import { gitTreeSha } from "../src/core/indexer/git-tree.ts";
import { InventoryReader } from "../src/core/inventory/store.ts";
import { copyDiff } from "../src/core/ops/files.ts";
import type { UpstreamDeps } from "../src/core/upstream/index.ts";
import { type Env, initWorkspace } from "../src/core/workspace.ts";
import { toRows } from "../src/ui/client/lib/model.ts";

/*
 * Characterization test: one fixture home that touches every source, every
 * provenance kind and every upstream status, run through `inventory --check`.
 * The snapshot is the whole workspace plus CLI output, UI rows and a diff.
 * Refactors must leave it unchanged; a deliberate format change updates it
 * (`bun test --update-snapshots`) in the same commit so the diff shows it.
 */

let tmp: string;
let home: string;
let env: Env;

/** Deterministic commits: fixed identity and dates, no user config or signing. */
const GIT_ENV = {
	...process.env,
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_AUTHOR_NAME: "t",
	GIT_AUTHOR_EMAIL: "t@t",
	GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
	GIT_COMMITTER_NAME: "t",
	GIT_COMMITTER_EMAIL: "t@t",
	GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

function skill(dir: string, frontmatter: string, body = "Body.\n"): string {
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, "SKILL.md"), `---\n${frontmatter}---\n${body}`);
	return realpathSync(dir);
}

const fm = (name: string, extra = "") =>
	`name: ${name}\ndescription: ${name} skill\n${extra}`;

function git(cwd: string, ...args: string[]) {
	const proc = Bun.spawnSync(["git", ...args], { cwd, env: GIT_ENV });
	if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
}

function buildHome() {
	const agents = path.join(home, ".agents/skills");

	// npx skills: one copy as installed, one edited after install.
	const alpha = skill(path.join(agents, "alpha"), fm("alpha"));
	writeFileSync(path.join(agents, "alpha/reference.md"), "ref\n");
	skill(path.join(agents, "beta"), fm("beta"));
	skill(path.join(agents, "epsilon"), fm("epsilon"));
	writeFileSync(
		path.join(home, ".agents/.skill-lock.json"),
		JSON.stringify({
			version: 3,
			skills: {
				alpha: {
					source: "o/skills",
					sourceType: "github",
					sourceUrl: "https://github.com/o/skills.git",
					skillPath: "skills/alpha/SKILL.md",
					skillFolderHash: gitTreeSha(alpha),
					installedAt: "2026-01-01T00:00:00Z",
				},
				beta: {
					source: "o/skills",
					sourceType: "github",
					sourceUrl: "https://github.com/o/skills.git",
					skillPath: "skills/beta/SKILL.md",
					skillFolderHash: "0".repeat(40),
				},
				epsilon: {
					source: "o/gone",
					sourceType: "github",
					sourceUrl: "https://github.com/o/gone.git",
					skillPath: "skills/epsilon/SKILL.md",
					skillFolderHash: "1".repeat(40),
				},
			},
		}),
	);

	// gh skill: provenance in frontmatter, pinned ref.
	skill(
		path.join(agents, "delta"),
		fm(
			"delta",
			"metadata:\n  github-repo: o/gh\n  github-ref: v1\n  github-tree-sha: aaaa\n  github-path: skills/delta\n  github-pinned: v1\n",
		),
	);

	// Broken frontmatter, a dot-folder, a nested grouping folder and a loop.
	mkdirSync(path.join(agents, "bad"));
	writeFileSync(path.join(agents, "bad/SKILL.md"), "no frontmatter here\n");
	skill(path.join(agents, ".trash/old"), fm("old"));
	skill(path.join(agents, "group/nested"), fm("nested"));
	symlinkSync(path.join(agents, "group"), path.join(agents, "group/loop"));

	// Two names that map to the same inventory file name.
	skill(path.join(agents, "x-slash"), 'name: "x/y"\ndescription: slash\n');
	skill(path.join(agents, "x-under"), fm("x_y"));

	// Claude Code: symlinks into ~/.agents, plus a desktop-app synced skill.
	const claude = path.join(home, ".claude/skills");
	mkdirSync(claude, { recursive: true });
	symlinkSync(path.join(agents, "alpha"), path.join(claude, "alpha"));
	symlinkSync(path.join(agents, "beta"), path.join(claude, "beta"));
	skill(path.join(claude, "synced/abc/gamma"), fm("gamma"));

	// Byte copy in Cursor, edited copy in Gemini (drift).
	cpSync(path.join(agents, "alpha"), path.join(home, ".cursor/skills/alpha"), {
		recursive: true,
	});
	skill(path.join(home, ".gemini/skills/beta"), fm("beta"), "Edited body.\n");

	// Skills Manager library copy of alpha.
	const managed = path.join(home, ".skills-manager/skills/alpha");
	cpSync(path.join(agents, "alpha"), managed, { recursive: true });
	const db = new Database(path.join(home, ".skills-manager/skills-manager.db"));
	db.run(
		"CREATE TABLE skills (central_path TEXT, source_type TEXT, source_ref TEXT, source_revision TEXT, remote_revision TEXT, update_status TEXT)",
	);
	db.run(
		"INSERT INTO skills VALUES (?, 'import', ?, NULL, NULL, 'up_to_date')",
		[realpathSync(managed), path.join(home, ".cursor/skills/alpha")],
	);
	db.close();

	// Claude Code plugin.
	const plugin = path.join(home, ".claude/plugins/cache/p/paper/0.1.0");
	skill(path.join(plugin, "skills/design"), fm("design"));
	writeFileSync(
		path.join(home, ".claude/plugins/installed_plugins.json"),
		JSON.stringify({
			version: 2,
			plugins: {
				"paper@p": [
					{ installPath: plugin, version: "0.1.0", gitCommitSha: "cd89" },
				],
			},
		}),
	);

	// A git checkout, reached through a custom root in skillctx.yaml.
	const repo = path.join(home, "src/understand");
	skill(path.join(repo, "skills/understand"), fm("understand"));
	git(repo, "init", "-q", "-b", "main");
	git(repo, "add", ".");
	git(repo, "commit", "-q", "-m", "init");
	git(repo, "remote", "add", "origin", "https://github.com/o/understand.git");
}

/** Fake GitHub and git: one outdated, one up to date, one missing, one error. */
const upstreamDeps = (): UpstreamDeps => ({
	token: "test-token",
	now: () => new Date("2026-10-02T00:00:00Z"),
	lsRemote: () => "f".repeat(40),
	fetch: (async (url: string) => {
		if (url.includes("/repos/o/skills/"))
			return Response.json({
				tree: [
					{ path: "skills/alpha", type: "tree", sha: "b".repeat(40) },
					{ path: "skills/beta", type: "tree", sha: "0".repeat(40) },
				],
			});
		if (url.includes("/repos/o/gh/"))
			return Response.json({
				tree: [{ path: "skills/delta", type: "tree", sha: "aaaa" }],
			});
		return new Response("", { status: 404 });
	}) as unknown as typeof fetch,
});

/** Every file in the workspace except the timestamped cache, by relative path. */
function readTree(root: string): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (dir: string) => {
		for (const name of readdirSync(dir).sort()) {
			const full = path.join(dir, name);
			const rel = path.relative(root, full);
			if (rel === ".cache") continue;
			if (statSync(full).isDirectory()) walk(full);
			else out[rel] = readFileSync(full, "utf8");
		}
	};
	walk(root);
	return out;
}

beforeEach(() => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-golden-"));
	home = path.join(tmp, "home");
	env = { homeDir: home, configDir: path.join(home, ".config/skillctx") };
	mkdirSync(home, { recursive: true });
	buildHome();
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("golden inventory", () => {
	test("inventory --check output is unchanged", async () => {
		const { workspace } = initWorkspace("~/ws", env);
		writeFileSync(
			path.join(workspace.root, "skillctx.yaml"),
			"version: 1\nroots:\n  - ~/src/understand/skills\n",
		);

		const out: string[] = [];
		const err: string[] = [];
		const io = {
			out: (l: string) => out.push(l),
			err: (l: string) => err.push(l),
		};
		const code = await inventoryCommand(["--check"], io, env, upstreamDeps);
		expect(code).toBe(0);

		// Nothing absolute may leak into committed files or output.
		const files = readTree(workspace.root);
		const all = [...Object.values(files), ...out, ...err].join("\n");
		expect(all).not.toContain(tmp);
		expect(all).not.toContain(realpathSync(tmp));

		for (const [rel, text] of Object.entries(files))
			expect(text).toMatchSnapshot(rel);
		expect(out.join("\n")).toMatchSnapshot("stdout");
		expect(err.join("\n")).toMatchSnapshot("stderr");

		const store = new InventoryReader(workspace);
		expect(toRows(store.skills(), store.upstream() ?? null)).toMatchSnapshot(
			"ui rows",
		);
		expect(copyDiff(store.skill("beta"), 0, 1, home)).toMatchSnapshot(
			"diff beta 0..1",
		);
	});
});
