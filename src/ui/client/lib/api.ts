import type {
	InventorySummary,
	SkillRecord,
} from "../../../core/inventory/format.ts";
import type { UpstreamReport } from "../../../core/upstream/index.ts";
import type { CopyDiff, CopyFiles, FileText } from "../../data.ts";
import type { RefreshResult } from "../../server.ts";

/*
 * The client side of src/ui/server.ts: every request the page makes. Errors
 * carry the server's message when it sent one. Reads take an AbortSignal so
 * a query can cancel a request it no longer needs (lib/queries.ts).
 */

export interface Inventory {
	summary: InventorySummary | null;
	upstream: UpstreamReport | null;
	skills: SkillRecord[];
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
	const res = await fetch(url, { signal });
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(body?.error ?? `${url} returned ${res.status}`);
	}
	return (await res.json()) as T;
}

export async function loadInventory(signal?: AbortSignal): Promise<Inventory> {
	const [summary, upstream, skills] = await Promise.all([
		getJson<InventorySummary | null>("/api/summary", signal),
		getJson<UpstreamReport | null>("/api/upstream", signal),
		getJson<SkillRecord[]>("/api/skills", signal),
	]);
	return { summary, upstream, skills };
}

/**
 * Rescan, and with `check` compare with upstream. Fetches the per-session
 * token first; the server refuses refreshes without it. Throws only when the
 * server can't be reached.
 */
export async function refresh(check: boolean): Promise<RefreshResult> {
	const { token } = await getJson<{ token: string }>("/api/session");
	const res = await fetch("/api/refresh", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-skillctx-token": token,
		},
		body: JSON.stringify({ check }),
	});
	const body = (await res.json()) as { message?: string; error?: string };
	return res.ok
		? { ok: true, message: body.message ?? "Done." }
		: { ok: false, message: body.error ?? `Refresh failed (${res.status}).` };
}

export function copyDiff(
	name: string,
	a: number,
	b: number,
	signal?: AbortSignal,
): Promise<CopyDiff> {
	return getJson<CopyDiff>(
		`/api/skills/${encodeURIComponent(name)}/diff?a=${a}&b=${b}`,
		signal,
	);
}

export function copyFiles(
	name: string,
	copy: number,
	signal?: AbortSignal,
): Promise<CopyFiles> {
	return getJson<CopyFiles>(
		`/api/skills/${encodeURIComponent(name)}/files?copy=${copy}`,
		signal,
	);
}

export function copyFile(
	name: string,
	copy: number,
	file: string,
	signal?: AbortSignal,
): Promise<FileText> {
	return getJson<FileText>(
		`/api/skills/${encodeURIComponent(name)}/file?copy=${copy}&path=${encodeURIComponent(file)}`,
		signal,
	);
}
