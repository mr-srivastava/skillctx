import { afterEach, describe, expect, test } from "bun:test";
import {
	copyDiffQuery,
	copyFileQuery,
	createQueryClient,
	inventoryQuery,
	refreshAll,
} from "../src/ui/client/lib/queries.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** Answer the refresh round trip (/api/session, then /api/refresh). */
function serve(refresh: { status: number; body: object }) {
	globalThis.fetch = (async (url: string) => {
		if (url === "/api/session") return Response.json({ token: "t" });
		if (url === "/api/refresh")
			return Response.json(refresh.body, { status: refresh.status });
		throw new Error(`unexpected request ${url}`);
	}) as typeof fetch;
}

function seeded() {
	const client = createQueryClient();
	client.setQueryData(inventoryQuery.queryKey, {
		summary: null,
		upstream: null,
		skills: [],
	});
	client.setQueryData(copyFileQuery("alpha", 0, "SKILL.md").queryKey, {
		path: "SKILL.md",
		bytes: 3,
		text: "old",
	});
	return client;
}

describe("page queries", () => {
	test("a successful refresh marks every query stale, files included", async () => {
		serve({ status: 200, body: { message: "Scanned 1 skills." } });
		const client = seeded();
		const result = await refreshAll(client, false);
		expect(result).toEqual({ ok: true, message: "Scanned 1 skills." });
		for (const key of [
			inventoryQuery.queryKey,
			copyFileQuery("alpha", 0, "SKILL.md").queryKey,
		]) {
			expect(client.getQueryState(key)?.isInvalidated).toBe(true);
		}
	});

	test("a refused refresh leaves the cache alone", async () => {
		serve({ status: 409, body: { error: "A refresh is already running" } });
		const client = seeded();
		const result = await refreshAll(client, true);
		expect(result).toEqual({
			ok: false,
			message: "A refresh is already running",
		});
		expect(client.getQueryState(inventoryQuery.queryKey)?.isInvalidated).toBe(
			false,
		);
	});

	test("comparing a copy with itself makes no request", () => {
		expect(copyDiffQuery("alpha", 1, 1).enabled).toBe(false);
		expect(copyDiffQuery("alpha", 0, 1).enabled).toBe(true);
	});
});
