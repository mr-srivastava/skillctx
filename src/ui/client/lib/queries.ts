import {
	mutationOptions,
	QueryClient,
	queryOptions,
	skipToken,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
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
				// The server is 127.0.0.1, so the browser's online state says
				// nothing about it. The default ("online") would leave the page
				// loading forever on a machine with no network (local-first).
				networkMode: "always",
			},
			mutations: { networkMode: "always" },
		},
	});
}

export const inventoryQuery = queryOptions({
	queryKey: ["inventory"],
	queryFn: ({ signal }) => api.loadInventory(signal),
	// `skillctx inventory` in a terminal rescans too; pick that up when the
	// reader comes back to the page.
	staleTime: 0,
	refetchOnWindowFocus: true,
});

export function copyFilesQuery(name: string, copy: number) {
	return queryOptions({
		queryKey: ["skill", name, "files", copy],
		queryFn: ({ signal }) => api.copyFiles(name, copy, signal),
	});
}

/** One file of a copy; `path` null (not picked yet) fetches nothing. */
export function copyFileQuery(name: string, copy: number, path: string | null) {
	return queryOptions({
		queryKey: ["skill", name, "file", copy, path],
		queryFn:
			path === null
				? skipToken
				: ({ signal }) => api.copyFile(name, copy, path, signal),
	});
}

/** Comparing a copy with itself fetches nothing. */
export function copyDiffQuery(name: string, a: number, b: number) {
	return queryOptions({
		queryKey: ["skill", name, "diff", a, b],
		queryFn:
			a === b ? skipToken : ({ signal }) => api.copyDiff(name, a, b, signal),
	});
}

/**
 * Rescan (and with `check`, compare with upstream), then reload everything:
 * a rescan can change any skill's files, not just the inventory. onSuccess
 * returns the reload, so the mutation stays pending until the page has the
 * new data. A refused refresh (ok: false) reloads nothing.
 */
export function refreshMutation(client: QueryClient) {
	return mutationOptions({
		mutationKey: ["refresh"],
		mutationFn: (check: boolean) => api.refresh(check),
		onSuccess: (result) => (result.ok ? client.invalidateQueries() : undefined),
	});
}

export function useRefresh() {
	return useMutation(refreshMutation(useQueryClient()));
}
