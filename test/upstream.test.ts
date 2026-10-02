import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
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
import { inventoryCommand } from "../src/cli/commands/inventory.ts";
import { main } from "../src/cli/index.ts";
import { gitTreeSha } from "../src/core/indexer/git-tree.ts";
import type { Skill } from "../src/core/indexer/index.ts";
import { scan } from "../src/core/inventory.ts";
import {
	type CheckDeps,
	checkUpstream,
	parseGithub,
	skillDir,
} from "../src/core/upstream/index.ts";
import { type Env, initWorkspace } from "../src/core/workspace.ts";

let tmp: string;
let home: string;
let env: Env;

beforeEach(() => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-up-"));
	home = path.join(tmp, "home");
	env = { homeDir: home, configDir: path.join(home, ".config/skillctx") };
	mkdirSync(home, { recursive: true });
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function skillFolder(dir: string, name: string) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: d\n---\nBody\n`,
	);
	return realpathSync(dir);
}

describe("gitTreeSha", () => {
	test("matches git write-tree for files, executables, symlinks and nested folders", () => {
		const dir = skillFolder(path.join(tmp, "s"), "s");
		mkdirSync(path.join(dir, "references/deep"), { recursive: true });
		writeFileSync(path.join(dir, "references/a.md"), "a\n");
		writeFileSync(path.join(dir, "references/deep/b.md"), "b\n");
		writeFileSync(path.join(dir, "run.sh"), "#!/bin/sh\n");
		chmodSync(path.join(dir, "run.sh"), 0o755);
		symlinkSync("references/a.md", path.join(dir, "link.md"));
		writeFileSync(
			path.join(dir, "references.txt"),
			"sorts before the folder\n",
		);

		const git = (...args: string[]) =>
			Bun.spawnSync(["git", ...args], { cwd: dir })
				.stdout.toString()
				.trim();
		git("init", "-q");
		git("add", "-A");
		expect(gitTreeSha(dir)).toBe(git("write-tree"));
	});
});

describe("helpers", () => {
	test("parseGithub handles https, .git and bare owner/repo", () => {
		expect(
			parseGithub("https://github.com/vercel-labs/agent-skills.git"),
		).toEqual({ owner: "vercel-labs", repo: "agent-skills" });
		expect(parseGithub("vercel-labs/agent-skills")).toEqual({
			owner: "vercel-labs",
			repo: "agent-skills",
		});
		expect(parseGithub("https://gitlab.com/a/b")).toBeUndefined();
	});

	test("skillDir accepts a SKILL.md path or a folder", () => {
		expect(skillDir("skills/x/SKILL.md")).toBe("skills/x");
		expect(skillDir("skills/x/")).toBe("skills/x");
	});
});

function lockSkill(name: string, sourceUrl: string, folderHash: string): Skill {
	return {
		name,
		description: "",
		versions: 1,
		drift: false,
		copies: [
			{
				realPath: path.join(home, ".agents/skills", name),
				hash: "h2:x",
				fileCount: 1,
				bytes: 1,
				description: "",
				entries: [],
				diagnostics: [],
				provenance: [
					{
						kind: "skill-lock",
						source: "o/r",
						sourceType: "github",
						sourceUrl,
						skillPath: `skills/${name}/SKILL.md`,
						folderHash,
					},
				],
			},
		],
	};
}

function stubDeps(
	responses: Record<string, Response>,
	calls: string[] = [],
): CheckDeps {
	return {
		homeDir: home,
		lsRemote: () => "ffff",
		now: () => new Date("2026-10-02T00:00:00Z"),
		fetch: (async (url: string) => {
			calls.push(url);
			const key = Object.keys(responses).find((k) => url.includes(k));
			return key
				? (responses[key] as Response).clone()
				: new Response("{}", { status: 404 });
		}) as unknown as typeof fetch,
	};
}

const tree = (entries: Record<string, string>) =>
	Response.json({
		truncated: false,
		tree: Object.entries(entries).map(([p, sha]) => ({
			path: p,
			type: "tree",
			sha,
		})),
	});

describe("checkUpstream", () => {
	test("one request per repo; compares tree SHAs", async () => {
		const calls: string[] = [];
		const report = await checkUpstream(
			[
				lockSkill("same", "https://github.com/o/r.git", "aaa"),
				lockSkill("old", "https://github.com/o/r.git", "bbb"),
				lockSkill("gone", "https://github.com/o/r.git", "ccc"),
			],
			stubDeps(
				{
					"/repos/o/r/git/trees/HEAD": tree({
						"skills/same": "aaa",
						"skills/old": "zzz",
					}),
				},
				calls,
			),
		);
		expect(calls.length).toBe(1);
		expect(report.requests).toBe(1);
		expect(
			Object.fromEntries(report.results.map((r) => [r.skill, r.status])),
		).toEqual({
			gone: "missing-upstream",
			old: "outdated",
			same: "up-to-date",
		});
		expect(report.results.find((r) => r.skill === "old")?.latest).toBe("zzz");
		expect(report.results[0]?.copy).toBe("~/.agents/skills/gone");
	});

	test("rate limiting becomes a readable error per skill", async () => {
		const report = await checkUpstream(
			[lockSkill("x", "https://github.com/o/r", "a")],
			stubDeps({
				"/repos/o/r/": new Response("{}", {
					status: 403,
					headers: { "x-ratelimit-reset": "0" },
				}),
			}),
		);
		expect(report.results[0]?.status).toBe("error");
		expect(report.results[0]?.error).toContain("rate limit");
	});

	test("git checkouts compare HEAD with ls-remote", async () => {
		const skill = lockSkill("u", "https://github.com/o/r", "a");
		const copy = skill.copies[0];
		if (!copy) throw new Error("fixture");
		copy.provenance = [
			{
				kind: "git-checkout",
				repoRoot: "/r",
				remote: "https://github.com/o/u.git",
				branch: "main",
				head: "1111",
			},
		];
		const deps = stubDeps({});
		const report = await checkUpstream([skill], {
			...deps,
			lsRemote: () => "2222",
		});
		expect(report.results[0]).toMatchObject({
			via: "git-checkout",
			status: "outdated",
			latest: "2222",
		});
	});
});

describe("inventory command and the network", () => {
	function setup() {
		const real = skillFolder(path.join(home, ".agents/skills/alpha"), "alpha");
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
						skillFolderHash: gitTreeSha(real),
					},
				},
			}),
		);
		initWorkspace("~/ws", env);
		return real;
	}

	test("without --check, no network is touched", async () => {
		setup();
		const original = globalThis.fetch;
		globalThis.fetch = (() => {
			throw new Error("network used");
		}) as unknown as typeof fetch;
		try {
			const code = await main(
				["inventory"],
				{ out: () => {}, err: () => {} },
				env,
			);
			expect(code).toBe(0);
		} finally {
			globalThis.fetch = original;
		}
	});

	test("scan marks copies edited after install", () => {
		const real = setup();
		const { workspace } = initWorkspace("~/ws", env);
		expect(scan(workspace, home).skills[0]?.copies[0]?.installState).toBe(
			"unchanged",
		);
		writeFileSync(path.join(real, "extra.md"), "local edit\n");
		expect(scan(workspace, home).summary.modifiedSinceInstall).toBe(1);
	});

	test("--check writes inventory/upstream.json and reports counts", async () => {
		setup();
		const out: string[] = [];
		const code = await inventoryCommand(
			["--check"],
			{ out: (l) => out.push(l), err: (l) => out.push(l) },
			env,
			() => {
				const { homeDir: _h, ...deps } = stubDeps({
					"/repos/o/r/git/trees/HEAD": tree({ "skills/alpha": "newer" }),
				});
				return deps;
			},
		);
		expect(code).toBe(0);
		expect(out.join("\n")).toContain(
			"1 requests (unauthenticated): 0 up to date, 1 outdated",
		);
		const report = JSON.parse(
			readFileSync(path.join(home, "ws/inventory/upstream.json"), "utf8"),
		);
		expect(report.results[0]).toMatchObject({
			skill: "alpha",
			status: "outdated",
			latest: "newer",
		});
	});
});
