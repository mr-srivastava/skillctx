import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeRefresh } from "../src/cli/commands/ui.ts";
import type { SkillRecord } from "../src/core/inventory/format.ts";
import { scan } from "../src/core/inventory/scan.ts";
import { writeInventory } from "../src/core/inventory/store.ts";
import {
	type Env,
	initWorkspace,
	type Workspace,
} from "../src/core/workspace.ts";
import { filterRows, NO_FILTERS, toRows } from "../src/ui/client/model.ts";
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
		refresh: makeRefresh(ws, env),
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
});
