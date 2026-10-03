import {
	QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { RefreshResult } from "../../server.ts";
import * as api from "./api.ts";

/*
 * Server state for the page (ADR-020). Each request in api.ts has a query
 * here, keyed so a skill's files and diffs share the ["skill", name] prefix.
 * The inventory only changes when something rescans, so data stays fresh
 * until a refresh invalidates it.
 */

export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: Number.POSITIVE_INFINITY,
				// The server is on this machine: a failure won't fix itself in a
				// second, and the page says what went wrong.
				retry: false,
				refetchOnWindowFocus: false,
			},
		},
	});
}

export const inventoryQuery = queryOptions({
	queryKey: ["inventory"],
	queryFn: api.loadInventory,
	// `skillctx inventory` in a terminal rescans too; pick that up when the
	// reader comes back to the page.
	staleTime: 0,
	refetchOnWindowFocus: true,
});

export function copyFilesQuery(name: string, copy: number) {
	return queryOptions({
		queryKey: ["skill", name, "files", copy],
		queryFn: () => api.copyFiles(name, copy),
	});
}

export function copyFileQuery(name: string, copy: number, path: string) {
	return queryOptions({
		queryKey: ["skill", name, "file", copy, path],
		queryFn: () => api.copyFile(name, copy, path),
	});
}

export function copyDiffQuery(name: string, a: number, b: number) {
	return queryOptions({
		queryKey: ["skill", name, "diff", a, b],
		queryFn: () => api.copyDiff(name, a, b),
		enabled: a !== b,
	});
}

/**
 * Rescan (and with `check`, compare with upstream), then reload everything:
 * a rescan can change any skill's files, not just the inventory.
 */
export async function refreshAll(
	client: QueryClient,
	check: boolean,
): Promise<RefreshResult> {
	const result = await api.refresh(check);
	if (result.ok) await client.invalidateQueries();
	return result;
}

export function useRefresh() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (check: boolean) => refreshAll(client, check),
	});
}
