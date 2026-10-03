import type {
	AdoptResult,
	AgentId,
	CopyDiff,
	DeploymentStatus,
	DeployMode,
	LockEntry,
	Plan,
	ReviewedOutcome,
	CopyFiles,
	FileText,
	InventorySummary,
	RefreshResult,
	SkillRecord,
	UpstreamReport,
} from "@/lib/core";

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
 * POST to a route that changes something. Fetches the per-session token
 * first; the server refuses these requests without it.
 */
async function post(
	url: string,
	body: unknown,
): Promise<{ status: number; ok: boolean; body: Record<string, unknown> }> {
	const { token } = await getJson<{ token: string }>("/api/session");
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-skillctx-token": token,
		},
		body: JSON.stringify(body),
	});
	const parsed = (await res.json().catch(() => ({}))) as Record<
		string,
		unknown
	>;
	return { status: res.status, ok: res.ok, body: parsed };
}

/** The server's refusal as an Error, with its message when it sent one. */
function refused(
	url: string,
	res: { status: number; body: Record<string, unknown> },
) {
	const message =
		typeof res.body.error === "string" ? res.body.error : undefined;
	return new Error(message ?? `${url} returned ${res.status}`);
}

/**
 * Rescan, and with `check` compare with upstream. Throws only when the
 * server can't be reached.
 */
export async function refresh(check: boolean): Promise<RefreshResult> {
	const res = await post("/api/refresh", { check });
	const { message, error } = res.body as { message?: string; error?: string };
	return res.ok
		? { ok: true, message: message ?? "Done." }
		: { ok: false, message: error ?? `Refresh failed (${res.status}).` };
}

/** Managed skills, by name. */
export function loadLibrary(
	signal?: AbortSignal,
): Promise<Record<string, LockEntry>> {
	return getJson<Record<string, LockEntry>>("/api/library", signal);
}

export function loadDeployments(
	signal?: AbortSignal,
): Promise<DeploymentStatus[]> {
	return getJson<DeploymentStatus[]>("/api/deployments", signal);
}

const skillUrl = (name: string, action: string) =>
	`/api/skills/${encodeURIComponent(name)}/${action}`;

/** Snapshot one copy into the library; `copy` defaults to the main copy. */
export async function adoptSkill(
	name: string,
	copy?: number,
): Promise<AdoptResult> {
	const url = skillUrl(name, "adopt");
	const res = await post(url, { copy });
	if (!res.ok) throw refused(url, res);
	return res.body as unknown as AdoptResult;
}

/** What deploying to `agents` would write; no agents plans an undeploy. */
export async function planDeploy(
	name: string,
	agents: readonly AgentId[],
	mode: DeployMode,
): Promise<Plan> {
	const url = skillUrl(name, "plan");
	const res = await post(url, { agents, mode });
	if (!res.ok) throw refused(url, res);
	return res.body as unknown as Plan;
}

/**
 * Apply a plan the person reviewed. If the folders changed since, nothing is
 * written and the outcome carries the new plan to show instead.
 */
export async function applyPlan(
	name: string,
	plan: Plan,
	confirmTakeover: boolean,
): Promise<ReviewedOutcome> {
	const url = skillUrl(name, "apply");
	const res = await post(url, { plan, confirmTakeover });
	if (res.ok || res.body.status === "changed")
		return res.body as unknown as ReviewedOutcome;
	throw refused(url, res);
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
