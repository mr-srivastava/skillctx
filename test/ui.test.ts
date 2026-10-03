import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Plan } from "../src/core/deploy/plan.ts";
import type { SkillRecord } from "../src/core/inventory/format.ts";
import { refreshInventory } from "../src/core/inventory/refresh.ts";
import { scan } from "../src/core/inventory/scan.ts";
import { writeInventory } from "../src/core/inventory/store.ts";
import { LOCK_FILE } from "../src/core/lock.ts";
import type {
	DeploymentStatus,
	ReviewedOutcome,
} from "../src/core/ops/deployments.ts";
import {
	type Env,
	initWorkspace,
	type Workspace,
} from "../src/core/workspace.ts";
import { adviceFor } from "../src/ui/client/lib/advice.ts";
import { formatBytes, plural } from "../src/ui/client/lib/format.ts";
import {
	deployedAgents,
	filterRows,
	NO_FILTERS,
	type Row,
	toRows,
} from "../src/ui/client/lib/model.ts";
import {
	LIBRARY_HREF,
	parseHash,
	skillHref,
} from "../src/ui/client/lib/routes.ts";
import { startUiServer, type UiServer } from "../src/ui/server.ts";

let tmp: string;
let home: string;
let env: Env;
let ws: Workspace;
let server: UiServer;

function skill(dir: string, name: string, body: string) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${name} helps\n---\n${body}`,
	);
}

beforeEach(() => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-ui-"));
	home = path.join(tmp, "home");
	env = { homeDir: home, configDir: path.join(home, ".config/skillctx") };
	skill(path.join(home, ".agents/skills/alpha"), "alpha", "One.\n");
	skill(path.join(home, ".cursor/skills/alpha"), "alpha", "Two.\n");
	skill(path.join(home, ".agents/skills/beta"), "beta", "Beta.\n");
	ws = initWorkspace("~/ws", env).workspace;
	writeInventory(ws, scan(ws, home), home);
	server = startUiServer({
		ws,
		homeDir: home,
		port: 0,
		refresh: (check) =>
			refreshInventory(ws, home, {
				check,
				upstream: () => {
					throw new Error("no network in tests");
				},
			}),
	});
});

afterEach(() => {
	server.stop();
	rmSync(tmp, { recursive: true, force: true });
});

const api = (p: string, init?: RequestInit) =>
	fetch(new URL(p, server.url), init);

describe("ui server", () => {
	test("binds to loopback and serves the inventory", async () => {
		expect(server.url).toStartWith("http://127.0.0.1:");
		const skills = (await (await api("/api/skills")).json()) as SkillRecord[];
		expect(skills.map((s) => s.name)).toEqual(["alpha", "beta"]);
		const one = (await (await api("/api/skills/alpha")).json()) as SkillRecord;
		expect(one.drift).toBe(true);
		expect((await api("/api/skills/nope")).status).toBe(404);
	});

	test("serves the app page", async () => {
		const res = await api("/");
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('<div id="root">');
	});

	test("diff shows what differs between two copies", async () => {
		const diff = (await (
			await api("/api/skills/alpha/diff?a=0&b=1")
		).json()) as {
			files: { path: string; status: string; patch?: string }[];
		};
		expect(diff.files.map((f) => [f.path, f.status])).toEqual([
			["SKILL.md", "changed"],
		]);
		expect(diff.files[0]?.patch).toMatch(/[-+]Two\./);
	});

	test("lists a copy's files and serves them as text", async () => {
		writeFileSync(
			path.join(home, ".agents/skills/alpha/notes.md"),
			"# Notes\n",
		);
		const listing = (await (
			await api("/api/skills/alpha/files?copy=0")
		).json()) as { realPath: string; files: { path: string; bytes: number }[] };
		expect(listing.realPath).toStartWith("~/");
		expect(listing.files.map((f) => f.path)).toContain("SKILL.md");

		const copy = listing.realPath.includes(".agents") ? 0 : 1;
		const file = (await (
			await api(`/api/skills/alpha/file?copy=${copy}&path=notes.md`)
		).json()) as { text: string };
		expect(file.text).toBe("# Notes\n");
		expect(
			(await api("/api/skills/alpha/file?copy=9&path=SKILL.md")).status,
		).toBe(404);
	});

	test("refuses file paths outside the skill folder", async () => {
		for (const p of [
			"../beta/SKILL.md",
			"../../.agents/skills/beta/SKILL.md",
			path.join(home, ".agents/skills/beta/SKILL.md"),
			"",
		]) {
			const res = await api(
				`/api/skills/alpha/file?copy=0&path=${encodeURIComponent(p)}`,
			);
			expect([p, res.status]).toEqual([p, 404]);
		}
	});

	test("an inventory from a newer skillctx comes back as a readable error", async () => {
		ws.write("inventory/summary.json", JSON.stringify({ format: 99 }));
		const res = await api("/api/summary");
		expect(res.status).toBe(500);
		expect(((await res.json()) as { error: string }).error).toContain(
			"Upgrade skillctx",
		);
	});

	test("rejects a foreign Host header (DNS rebinding)", async () => {
		const res = await api("/api/skills", {
			headers: { host: "evil.example:80" },
		});
		expect(res.status).toBe(403);
	});

	test("refresh needs the session token and a same-origin request", async () => {
		const post = (headers: Record<string, string>) =>
			api("/api/refresh", {
				method: "POST",
				headers: { "content-type": "application/json", ...headers },
				body: "{}",
			});

		expect((await post({})).status).toBe(403);
		const { token } = (await (await api("/api/session")).json()) as {
			token: string;
		};
		expect(
			(
				await post({
					"x-skillctx-token": token,
					origin: "https://evil.example",
				})
			).status,
		).toBe(403);

		skill(path.join(home, ".agents/skills/gamma"), "gamma", "New.\n");
		const ok = await post({ "x-skillctx-token": token });
		expect(ok.status).toBe(200);
		expect(((await ok.json()) as { message: string }).message).toContain(
			"Scanned 3 skills",
		);
		const skills = (await (await api("/api/skills")).json()) as SkillRecord[];
		expect(skills.map((s) => s.name)).toContain("gamma");
	});

	test("refresh answers 409 while another process changes the workspace", async () => {
		const { token } = (await (await api("/api/session")).json()) as {
			token: string;
		};
		mkdirSync(path.dirname(ws.resolve(LOCK_FILE)), { recursive: true });
		writeFileSync(
			ws.resolve(LOCK_FILE),
			JSON.stringify({ pid: process.ppid, since: "earlier" }),
		);
		const res = await api("/api/refresh", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-skillctx-token": token,
			},
			body: "{}",
		});
		expect(res.status).toBe(409);
		expect(((await res.json()) as { error: string }).error).toContain(
			`pid ${process.ppid}`,
		);
	});
});

describe("ui mutations", () => {
	let token: string;
	const post = (route: string, body: unknown, headers = {}) =>
		api(route, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-skillctx-token": token,
				...headers,
			},
			body: JSON.stringify(body),
		});
	const json = async <T = unknown>(res: Response | Promise<Response>) =>
		(await (await res).json()) as T;
	const claudeEntry = () => path.join(home, ".claude/skills/beta");

	beforeEach(async () => {
		({ token } = await json<{ token: string }>(api("/api/session")));
	});

	test("every mutation needs the session token", async () => {
		for (const action of ["adopt", "plan", "apply"]) {
			const res = await post(
				`/api/skills/beta/${action}`,
				{},
				{
					"x-skillctx-token": "wrong",
				},
			);
			expect(res.status).toBe(403);
		}
		expect((await api("/api/skills/beta/adopt")).status).toBe(404);
		expect(await json<object>(api("/api/library"))).toEqual({});
	});

	test("adopt, plan, apply, then undeploy the same way", async () => {
		const adopted = await post("/api/skills/beta/adopt", {});
		expect(adopted.status).toBe(200);
		expect(Object.keys(await json(api("/api/library")))).toEqual(["beta"]);

		const plan = await json<Plan>(
			post("/api/skills/beta/plan", { agents: ["claude"], mode: "symlink" }),
		);
		expect(plan.ops).toEqual([
			{
				kind: "create",
				folder: "~/.claude/skills",
				entry: "~/.claude/skills/beta",
			},
		]);
		expect(existsSync(claudeEntry())).toBe(false);

		const applied = await post("/api/skills/beta/apply", { plan });
		expect(applied.status).toBe(200);
		expect((await json<ReviewedOutcome>(applied)).status).toBe("applied");
		expect(lstatSync(claudeEntry()).isSymbolicLink()).toBe(true);
		const deployed = await json<DeploymentStatus[]>(api("/api/deployments"));
		expect(deployed.map((d) => [d.entry, d.state])).toEqual([
			["~/.claude/skills/beta", "ours"],
		]);

		const undeploy = await json<Plan>(
			post("/api/skills/beta/plan", { agents: [] }),
		);
		expect(undeploy.ops.map((o) => o.kind)).toEqual(["remove"]);
		expect(
			(await post("/api/skills/beta/apply", { plan: undeploy })).status,
		).toBe(200);
		expect(existsSync(claudeEntry())).toBe(false);
		expect(await json<unknown[]>(api("/api/deployments"))).toEqual([]);
	});

	test("a plan the disk has moved on from is not applied; the new plan comes back", async () => {
		await post("/api/skills/beta/adopt", {});
		const plan = await json<Plan>(
			post("/api/skills/beta/plan", { agents: ["claude"] }),
		);
		// Another tool installs its own beta after the plan was shown.
		skill(claudeEntry(), "beta", "Theirs.\n");
		const res = await post("/api/skills/beta/apply", { plan });
		expect(res.status).toBe(409);
		const outcome = await json<ReviewedOutcome>(res);
		expect(outcome.status).toBe("changed");
		expect(outcome.plan.ops).toEqual([]);
		expect(outcome.plan.blocked.map((b) => b.agent)).toEqual(["claude"]);
		expect(lstatSync(claudeEntry()).isDirectory()).toBe(true);
		expect(await json<unknown[]>(api("/api/deployments"))).toEqual([]);
	});

	test("refusals reach the page as 400 with the reason", async () => {
		const unknown = await post("/api/skills/nope/adopt", {});
		expect(unknown.status).toBe(400);
		expect((await json<{ error: string }>(unknown)).error).toContain("nope");

		const notAdopted = await post("/api/skills/beta/plan", {
			agents: ["claude"],
		});
		expect(notAdopted.status).toBe(400);
		expect((await json<{ error: string }>(notAdopted)).error).toContain(
			"skillctx adopt beta",
		);

		const badAgent = await post("/api/skills/beta/plan", { agents: ["vim"] });
		expect((await json<{ error: string }>(badAgent)).error).toBe(
			"Unknown agent vim",
		);
		expect((await post("/api/skills/beta/adopt", { copy: -1 })).status).toBe(
			400,
		);
		expect((await post("/api/skills/beta/apply", {})).status).toBe(400);

		await post("/api/skills/beta/adopt", {});
		const plan = await json<Plan>(
			post("/api/skills/beta/plan", { agents: ["claude"] }),
		);
		const other = await post("/api/skills/alpha/apply", { plan });
		expect((await json<{ error: string }>(other)).error).toBe(
			"The plan is for a different skill",
		);
	});

	test("adopt answers 409 while another process changes the workspace", async () => {
		mkdirSync(path.dirname(ws.resolve(LOCK_FILE)), { recursive: true });
		writeFileSync(
			ws.resolve(LOCK_FILE),
			JSON.stringify({ pid: process.ppid, since: "earlier" }),
		);
		expect((await post("/api/skills/beta/adopt", {})).status).toBe(409);
	});
});

describe("deployed agents", () => {
	const at = (
		folder: string,
		state: DeploymentStatus["state"],
		skillName = "beta",
	): DeploymentStatus => ({
		skill: skillName,
		folder,
		entry: `${folder}/${skillName}`,
		mode: "symlink",
		hash: "h",
		deployedAt: "t",
		state,
	});

	test("every agent reading a folder where the deployment is still ours", () => {
		expect(deployedAgents("beta", [at("~/.claude/skills", "ours")])).toEqual([
			"claude",
			"cursor",
		]);
		expect(deployedAgents("beta", [at("~/.agents/skills", "ours")])).toEqual([
			"codex",
			"cursor",
			"gemini",
		]);
	});

	test("taken-back or missing entries and other skills don't count", () => {
		expect(
			deployedAgents("beta", [
				at("~/.claude/skills", "taken-back"),
				at("~/.gemini/skills", "missing"),
				at("~/.config/opencode/skills", "ours", "alpha"),
			]),
		).toEqual([]);
	});
});

describe("list model", () => {
	test("statuses come from drift, edits and upstream; filters combine", () => {
		const records = scan(ws, home).skills.map((s) => ({
			name: s.name,
			description: s.description,
			drift: s.drift,
			sources: [],
			copies: s.copies.map((c) => ({
				installState: c.installState,
				diagnostics: c.diagnostics,
				seenIn: c.entries.map((e) => ({ root: e.rootId })),
			})),
		})) as unknown as SkillRecord[];
		const rows = toRows(records, {
			checkedAt: "x",
			requests: 1,
			results: [
				{
					skill: "beta",
					copy: "~",
					via: "skill-lock",
					repo: "r",
					installed: "a",
					latest: "b",
					status: "outdated",
				},
			],
		});
		expect(rows.find((r) => r.name === "alpha")?.statuses).toEqual(["drift"]);
		expect(rows.find((r) => r.name === "beta")?.statuses).toEqual(["outdated"]);
		expect(rows.find((r) => r.name === "alpha")?.roots).toEqual([
			"agents",
			"cursor",
		]);

		expect(
			filterRows(rows, { ...NO_FILTERS, status: "outdated" }).map(
				(r) => r.name,
			),
		).toEqual(["beta"]);
		expect(
			filterRows(rows, { ...NO_FILTERS, root: "cursor" }).map((r) => r.name),
		).toEqual(["alpha"]);
		expect(
			filterRows(rows, { ...NO_FILTERS, query: "BETA" }).map((r) => r.name),
		).toEqual(["beta"]);
		expect(
			filterRows(rows, {
				...NO_FILTERS,
				source: "untracked",
				status: "drift",
			}).map((r) => r.name),
		).toEqual(["alpha"]);

		const managed = new Set(["beta"]);
		const inLibrary = (library: "managed" | "unmanaged") =>
			filterRows(rows, { ...NO_FILTERS, library }, managed).map((r) => r.name);
		expect(inLibrary("managed")).toEqual(["beta"]);
		expect(inLibrary("unmanaged")).toEqual(["alpha"]);
		expect(filterRows(rows, NO_FILTERS, managed)).toHaveLength(2);
	});
});

describe("skill advice", () => {
	const row = (over: Partial<Row>): Row => ({
		name: "beta",
		description: "",
		sources: [],
		roots: [],
		presence: {},
		statuses: [],
		upstream: [],
		...over,
	});

	test("nothing to say about a skill with no statuses", () => {
		expect(adviceFor({ name: "beta", drift: false }, row({}))).toEqual([]);
	});

	test("an outdated skill gets its update command; a failed check says why", () => {
		const advice = adviceFor(
			{ name: "beta", drift: false },
			row({
				statuses: ["outdated"],
				upstream: [
					{
						skill: "beta",
						copy: "~/.agents/skills/beta",
						via: "skill-lock",
						repo: "https://github.com/acme/skills.git",
						installed: "a",
						latest: "b",
						status: "outdated",
					},
					{
						skill: "beta",
						copy: "~/.cursor/skills/beta",
						via: "skill-lock",
						repo: "r",
						installed: "a",
						status: "error",
						error: "rate limited",
					},
				],
			}),
		);
		expect(advice.map((a) => a.kind)).toEqual(["outdated", "error"]);
		expect(advice[0]?.text).toStartWith("acme/skills has a newer version");
		expect(advice[0]?.command).toBe("npx skills update beta");
		expect(advice[1]?.text).toContain("rate limited");
	});

	test("edits warn more strongly when an update is waiting; drift is explained", () => {
		const edited = (statuses: Row["statuses"]) =>
			adviceFor({ name: "beta", drift: true }, row({ statuses })).map(
				(a) => a.key,
			);
		expect(edited(["edited"])).toEqual(["edited", "drift"]);
		expect(edited(["outdated", "edited"])).toEqual([
			"edited-outdated",
			"drift",
		]);
	});
});

describe("routes", () => {
	test("links and the hash parser agree, names with slashes included", () => {
		for (const tab of ["contents", "where", "copies"] as const) {
			expect(parseHash(skillHref("a/b c", tab))).toEqual({
				name: "a/b c",
				tab,
			});
		}
		expect(skillHref("x")).toBe("#/skill/x");
	});

	test("anything else is the Library, opened on Contents", () => {
		for (const hash of [LIBRARY_HREF, "", "#/nope", "#/skill/%E0"]) {
			expect(parseHash(hash)).toEqual({ name: null, tab: "contents" });
		}
		expect(parseHash("#/skill/x/bogus").tab).toBe("contents");
	});
});

describe("format", () => {
	test("plural counts in words, with an irregular plural when given", () => {
		expect(plural(1, "skill")).toBe("1 skill");
		expect(plural(0, "skill")).toBe("0 skills");
		expect(plural(2, "copy", "copies")).toBe("2 copies");
	});

	test("sizes stay in bytes below a kilobyte", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(14_540)).toBe("14.2 KB");
	});
});

describe("client code", () => {
	test("imports cn from @/lib/utils, which knows our text sizes", async () => {
		const glob = new Bun.Glob("**/*.{ts,tsx}");
		const offenders: string[] = [];
		for await (const file of glob.scan("src/ui/client")) {
			const src = await Bun.file(`src/ui/client/${file}`).text();
			if (/from\s+["']cn["']/.test(src)) offenders.push(file);
		}
		expect(offenders).toEqual([]);
	});

	test("reaches core and the server only through lib/core.ts", async () => {
		const glob = new Bun.Glob("**/*.{ts,tsx}");
		const offenders: string[] = [];
		for await (const file of glob.scan("src/ui/client")) {
			if (file === path.join("lib", "core.ts")) continue;
			const src = await Bun.file(`src/ui/client/${file}`).text();
			for (const m of src.matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
				const target = path.normalize(`src/ui/client/${file}/../${m[1]}`);
				if (!target.startsWith(`src${path.sep}ui${path.sep}client${path.sep}`))
					offenders.push(`${file} -> ${m[1]}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test("core modules the client imports have no runtime Node imports", async () => {
		const glob = new Bun.Glob("**/*.{ts,tsx}");
		const fromCore = new Set<string>();
		for await (const file of glob.scan("src/ui/client")) {
			const src = await Bun.file(`src/ui/client/${file}`).text();
			// Type-only imports and re-exports are erased; only values count.
			for (const m of src.matchAll(
				/^(?:import|export) (?!type )[^;]*?from "((?:\.\.\/)+core\/[^"]+)"/gm,
			))
				if (m[1])
					fromCore.add(path.normalize(`src/ui/client/${file}/../${m[1]}`));
		}
		expect(fromCore.size).toBeGreaterThan(0);
		for (const file of fromCore) {
			const src = await Bun.file(file).text();
			expect([file, /^import (?!type )[^;]*from "node:/m.test(src)]).toEqual([
				file,
				false,
			]);
		}
	});
});
