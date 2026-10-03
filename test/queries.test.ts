import { afterEach, describe, expect, test } from "bun:test";
import {
	MutationObserver,
	onlineManager,
	skipToken,
} from "@tanstack/react-query";
import {
	copyDiffQuery,
	copyFileQuery,
	copyFilesQuery,
	createQueryClient,
	inventoryQuery,
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
