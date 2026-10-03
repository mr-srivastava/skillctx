import { afterEach, describe, expect, test } from "bun:test";
import {
	MutationObserver,
	onlineManager,
	skipToken,
} from "@tanstack/react-query";
import type { Plan } from "../src/core/deploy/plan.ts";
import {
	adoptMutation,
	applyMutation,
	copyDiffQuery,
	copyFileQuery,
	copyFilesQuery,
	createQueryClient,
	deploymentsQuery,
	inventoryQuery,
	libraryQuery,
	planMutation,
	refreshMutation,
} from "../src/ui/client/lib/queries.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
	onlineManager.setOnline(true);
});

type Route = (init?: RequestInit) => Response;

/** Answer requests by URL; anything unexpected fails the test. */
function serve(routes: Record<string, Route>) {
	globalThis.fetch = (async (url: string, init?: RequestInit) => {
		const route = routes[url];
		if (!route) throw new Error(`unexpected request ${url}`);
		return route(init);
	}) as typeof fetch;
}

const EMPTY_INVENTORY = { summary: null, upstream: null, skills: [] };

function seeded() {
	const client = createQueryClient();
	client.setQueryData(inventoryQuery.queryKey, EMPTY_INVENTORY);
	client.setQueryData(copyFileQuery("alpha", 0, "SKILL.md").queryKey, {
		path: "SKILL.md",
		bytes: 3,
		text: "old",
	});
	return client;
}

function refresh(client: ReturnType<typeof createQueryClient>, check: boolean) {
	return new MutationObserver(client, refreshMutation(client)).mutate(check);
}

describe("page queries", () => {
	test("a successful refresh marks every query stale, files included", async () => {
		serve({
			"/api/session": () => Response.json({ token: "t" }),
			"/api/refresh": () => Response.json({ message: "Scanned 1 skills." }),
		});
		const client = seeded();
		const result = await refresh(client, false);
		expect(result).toEqual({ ok: true, message: "Scanned 1 skills." });
		for (const key of [
			inventoryQuery.queryKey,
			copyFileQuery("alpha", 0, "SKILL.md").queryKey,
		]) {
			expect(client.getQueryState(key)?.isInvalidated).toBe(true);
		}
	});

	test("a refused refresh leaves the cache alone", async () => {
		serve({
			"/api/session": () => Response.json({ token: "t" }),
			"/api/refresh": () =>
				Response.json(
					{ error: "A refresh is already running" },
					{ status: 409 },
				),
		});
		const client = seeded();
		const result = await refresh(client, true);
		expect(result).toEqual({
			ok: false,
			message: "A refresh is already running",
		});
		expect(client.getQueryState(inventoryQuery.queryKey)?.isInvalidated).toBe(
			false,
		);
	});

	test("the page loads with no network: the server is on this machine", async () => {
		serve({
			"/api/summary": () => Response.json(null),
			"/api/upstream": () => Response.json(null),
			"/api/skills": () => Response.json([]),
		});
		onlineManager.setOnline(false);
		const client = createQueryClient();
		expect(await client.fetchQuery(inventoryQuery)).toEqual(EMPTY_INVENTORY);
	});

	test("requests carry the query's abort signal", async () => {
		let signal: AbortSignal | null | undefined;
		serve({
			"/api/skills/alpha/files?copy=0": (init) => {
				signal = init?.signal;
				return Response.json({ realPath: "/x", files: [] });
			},
		});
		await createQueryClient().fetchQuery(copyFilesQuery("alpha", 0));
		expect(signal).toBeInstanceOf(AbortSignal);
	});

	test("nothing to fetch: no file picked, or a copy compared with itself", () => {
		expect(copyFileQuery("alpha", 0, null).queryFn).toBe(skipToken);
		expect(copyDiffQuery("alpha", 1, 1).queryFn).toBe(skipToken);
		expect(copyDiffQuery("alpha", 0, 1).queryFn).not.toBe(skipToken);
	});
});

describe("library and deployment mutations", () => {
	const PLAN: Plan = {
		skill: "beta",
		hash: "h",
		mode: "symlink",
		agents: ["claude"],
		ops: [],
		blocked: [],
		warnings: [],
		needsConfirmation: false,
	};

	function cached() {
		const client = createQueryClient();
		client.setQueryData(libraryQuery.queryKey, {});
		client.setQueryData(deploymentsQuery.queryKey, []);
		client.setQueryData(inventoryQuery.queryKey, EMPTY_INVENTORY);
		const stale = (key: readonly unknown[]) =>
			client.getQueryState(key)?.isInvalidated;
		return { client, stale };
	}

	const apply = (client: ReturnType<typeof createQueryClient>) =>
		new MutationObserver(client, applyMutation(client)).mutate({
			name: "beta",
			plan: PLAN,
			confirmTakeover: false,
		});

	test("adopting reloads the library only", async () => {
		serve({
			"/api/session": () => Response.json({ token: "t" }),
			"/api/skills/beta/adopt": () => Response.json({ status: "adopted" }),
		});
		const { client, stale } = cached();
		await new MutationObserver(client, adoptMutation(client)).mutate({
			name: "beta",
		});
		expect(stale(libraryQuery.queryKey)).toBe(true);
		expect(stale(deploymentsQuery.queryKey)).toBe(false);
		expect(stale(inventoryQuery.queryKey)).toBe(false);
	});

	test("a plan is sent with the token and reloads nothing", async () => {
		let sent: RequestInit | undefined;
		serve({
			"/api/session": () => Response.json({ token: "t" }),
			"/api/skills/beta/plan": (init) => {
				sent = init;
				return Response.json(PLAN);
			},
		});
		const { client, stale } = cached();
		const plan = await new MutationObserver(client, planMutation).mutate({
			name: "beta",
			agents: ["claude"],
			mode: "symlink",
		});
		expect(plan).toEqual(PLAN);
		expect(new Headers(sent?.headers).get("x-skillctx-token")).toBe("t");
		expect(JSON.parse(sent?.body as string)).toEqual({
			agents: ["claude"],
			mode: "symlink",
		});
		expect(stale(deploymentsQuery.queryKey)).toBe(false);
	});

	test("an applied plan reloads the deployments; a changed one reloads nothing", async () => {
		let answer = Response.json({ status: "applied", plan: PLAN, applied: [] });
		serve({
			"/api/session": () => Response.json({ token: "t" }),
			"/api/skills/beta/apply": () => answer,
		});
		let { client, stale } = cached();
		expect((await apply(client)).status).toBe("applied");
		expect(stale(deploymentsQuery.queryKey)).toBe(true);

		answer = Response.json({ status: "changed", plan: PLAN }, { status: 409 });
		({ client, stale } = cached());
		const changed = await apply(client);
		expect(changed).toEqual({ status: "changed", plan: PLAN });
		expect(stale(deploymentsQuery.queryKey)).toBe(false);
	});

	test("a refused apply throws the server's reason", async () => {
		serve({
			"/api/session": () => Response.json({ token: "t" }),
			"/api/skills/beta/apply": () =>
				Response.json({ error: "Another skillctx process" }, { status: 409 }),
		});
		const error = await apply(cached().client).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe("Another skillctx process");
	});
});
