import { randomBytes } from "node:crypto";
import { type AgentId, isAgentId } from "../core/deploy/agents.ts";
import { planDeploy } from "../core/deploy/apply.ts";
import type { Plan } from "../core/deploy/plan.ts";
import type { DeployMode } from "../core/deploy/record.ts";
import type { RefreshOutcome } from "../core/inventory/refresh.ts";
import { InventoryReader } from "../core/inventory/store.ts";
import { adopt } from "../core/library/adopt.ts";
import { readLockfile } from "../core/library/store.ts";
import { WorkspaceBusyError } from "../core/lock.ts";
import {
	applyReviewed,
	displayPlan,
	listDeployments,
} from "../core/ops/deployments.ts";
import { copyDiff, copyFile, copyFiles } from "../core/ops/files.ts";
import { tallyUpstream } from "../core/upstream/index.ts";
import { type Workspace, WorkspaceError } from "../core/workspace.ts";
import index from "./client/index.html";

export interface RefreshResult {
	ok: boolean;
	message: string;
}

export interface UiServerOptions {
	ws: Workspace;
	homeDir: string;
	/** 0 picks a free port. */
	port?: number;
	/** Rescan, optionally followed by an upstream check (refreshInventory). */
	refresh: (check: boolean) => Promise<RefreshOutcome>;
	/** Serve the client unminified with hot module reload. Off in the binary. */
	dev?: boolean;
	/** Clock for adoptedAt and deployedAt. */
	now?: () => string;
}

export interface UiServer {
	url: string;
	port: number;
	token: string;
	stop: () => void;
}

/** One line for the page's status area. */
function refreshMessage({ scan, written, upstream }: RefreshOutcome): string {
	let message = `Scanned ${scan.summary.skills} skills: ${written.written} updated, ${written.removed} removed.`;
	if (upstream) {
		const t = tallyUpstream(upstream);
		message += ` Checked upstream with ${upstream.requests} requests: ${t.skills.outdated} outdated${t.errorResults ? `, ${t.errorResults} errors` : ""}.`;
	}
	return message;
}

type Handler<R extends Request = Request> = (
	req: R,
) => Response | Promise<Response>;

const badRequest = (error: string) => Response.json({ error }, { status: 400 });

/** The mode and agents a plan request names, or why they're unusable. */
function deployInput(body: {
	agents?: unknown;
	mode?: unknown;
}): { agents: AgentId[]; mode: DeployMode } | string {
	const agents = body.agents ?? [];
	if (!Array.isArray(agents) || !agents.every((a) => typeof a === "string"))
		return "agents must be a list of agent ids";
	const unknown = agents.filter((a) => !isAgentId(a));
	if (unknown.length > 0) return `Unknown agent ${unknown.join(", ")}`;
	const mode = body.mode ?? "symlink";
	if (mode !== "symlink" && mode !== "copy")
		return "mode must be symlink or copy";
	return { agents: agents as AgentId[], mode };
}

/**
 * Local-only UI server (ADR-005, ADR-010). Binds to 127.0.0.1. Every API
 * route rejects requests whose Host isn't this server, which blocks DNS
 * rebinding from reading the inventory. The one route that does work
 * (refresh) also needs a per-session token and a same-origin request;
 * cross-origin pages can't read /api/session, so they can't get the token.
 */
export function startUiServer(opts: UiServerOptions): UiServer {
	const store = new InventoryReader(opts.ws);
	const token = randomBytes(24).toString("hex");
	const now = opts.now ?? (() => new Date().toISOString());
	let refreshing = false;
	let port = 0;

	const guard =
		<R extends Request>(handler: Handler<R>): Handler<R> =>
		(req) => {
			const host = req.headers.get("host");
			if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
				return Response.json({ error: "Forbidden host" }, { status: 403 });
			}
			return handler(req);
		};

	/**
	 * A route that changes something: POST only, with the session token, from
	 * this page. The JSON body (empty object when missing) is passed along.
	 * A refused operation's message reaches the page: 409 when another process
	 * holds the workspace, 400 otherwise.
	 */
	const mutation = <R extends Request>(
		handler: (
			req: R,
			body: Record<string, unknown>,
		) => Response | Promise<Response>,
	) => ({
		POST: guard<R>(async (req) => {
			const origin = req.headers.get("origin");
			const sameOrigin =
				!origin ||
				origin === `http://127.0.0.1:${port}` ||
				origin === `http://localhost:${port}`;
			if (req.headers.get("x-skillctx-token") !== token || !sameOrigin) {
				return Response.json({ error: "Forbidden" }, { status: 403 });
			}
			const body = (await req.json().catch(() => null)) as unknown;
			try {
				return await handler(
					req,
					body && typeof body === "object"
						? (body as Record<string, unknown>)
						: {},
				);
			} catch (error) {
				if (error instanceof WorkspaceError)
					return Response.json(
						{ error: error.message },
						{ status: error instanceof WorkspaceBusyError ? 409 : 400 },
					);
				throw error;
			}
		}),
	});

	const skillName = (req: { params: { name: string } }) =>
		decodeURIComponent(req.params.name);

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: opts.port ?? 0,
		development: opts.dev ? { hmr: true, console: true } : false,
		routes: {
			"/": index,
			"/api/session": guard(() => Response.json({ token })),
			"/api/summary": guard(() => Response.json(store.summary() ?? null)),
			"/api/upstream": guard(() => Response.json(store.upstream() ?? null)),
			"/api/skills": guard(() => Response.json(store.skills())),
			"/api/skills/:name": guard((req: Bun.BunRequest<"/api/skills/:name">) => {
				const skill = store.skill(decodeURIComponent(req.params.name));
				return skill
					? Response.json(skill)
					: Response.json({ error: "Not found" }, { status: 404 });
			}),
			"/api/skills/:name/diff": guard(
				(req: Bun.BunRequest<"/api/skills/:name/diff">) => {
					const url = new URL(req.url);
					const diff = copyDiff(
						store.skill(decodeURIComponent(req.params.name)),
						Number(url.searchParams.get("a")),
						Number(url.searchParams.get("b")),
						opts.homeDir,
					);
					return diff
						? Response.json(diff)
						: Response.json({ error: "Not found" }, { status: 404 });
				},
			),
			"/api/skills/:name/files": guard(
				(req: Bun.BunRequest<"/api/skills/:name/files">) => {
					const url = new URL(req.url);
					const files = copyFiles(
						store.skill(decodeURIComponent(req.params.name)),
						Number(url.searchParams.get("copy")),
						opts.homeDir,
					);
					return files
						? Response.json(files)
						: Response.json({ error: "Not found" }, { status: 404 });
				},
			),
			"/api/skills/:name/file": guard(
				(req: Bun.BunRequest<"/api/skills/:name/file">) => {
					const url = new URL(req.url);
					const file = copyFile(
						store.skill(decodeURIComponent(req.params.name)),
						Number(url.searchParams.get("copy")),
						url.searchParams.get("path") ?? "",
						opts.homeDir,
					);
					return file
						? Response.json(file)
						: Response.json({ error: "Not found" }, { status: 404 });
				},
			),
			"/api/library": guard(() => Response.json(readLockfile(opts.ws).skills)),
			"/api/deployments": guard(() =>
				Response.json(listDeployments(opts.ws, opts.homeDir)),
			),
			"/api/skills/:name/adopt": mutation(
				(req: Bun.BunRequest<"/api/skills/:name/adopt">, body) => {
					const copy = body.copy;
					if (
						copy !== undefined &&
						!(Number.isInteger(copy) && Number(copy) >= 0)
					)
						return badRequest("copy must be a copy index: 0, 1, ...");
					const result = adopt(opts.ws, opts.homeDir, {
						name: skillName(req),
						copy: copy as number | undefined,
						now: now(),
					});
					return Response.json(result);
				},
			),
			// Deploying and undeploying both go plan, show, confirm, apply. No
			// agents plans an undeploy. Planning may rebuild a missing build,
			// so it's a mutation too.
			"/api/skills/:name/plan": mutation(
				(req: Bun.BunRequest<"/api/skills/:name/plan">, body) => {
					const input = deployInput(body);
					if (typeof input === "string") return badRequest(input);
					const p = planDeploy(opts.ws, opts.homeDir, {
						skill: skillName(req),
						...input,
					});
					return Response.json(displayPlan(p, opts.homeDir));
				},
			),
			"/api/skills/:name/apply": mutation(
				(req: Bun.BunRequest<"/api/skills/:name/apply">, body) => {
					const reviewed = body.plan as Plan | undefined;
					if (!reviewed || typeof reviewed !== "object")
						return badRequest("plan is required: the plan you reviewed");
					const input = deployInput(reviewed);
					if (typeof input === "string") return badRequest(input);
					if (reviewed.skill !== skillName(req))
						return badRequest("The plan is for a different skill");
					const outcome = applyReviewed(
						opts.ws,
						opts.homeDir,
						{ ...reviewed, ...input },
						{ confirmTakeover: body.confirmTakeover === true, now: now() },
					);
					return Response.json(outcome, {
						status: outcome.status === "changed" ? 409 : 200,
					});
				},
			),
			"/api/refresh": mutation(async (_req, body) => {
				if (refreshing) {
					return Response.json(
						{ error: "A refresh is already running" },
						{ status: 409 },
					);
				}
				refreshing = true;
				try {
					const outcome = await opts.refresh(Boolean(body.check));
					return Response.json({
						ok: true,
						message: refreshMessage(outcome),
					} satisfies RefreshResult);
				} finally {
					refreshing = false;
				}
			}),
		},
		fetch: () => new Response("Not found", { status: 404 }),
		// Reader errors (e.g. an inventory from a newer skillctx) reach the page as text.
		error: (error) => Response.json({ error: error.message }, { status: 500 }),
	});

	port = server.port ?? 0;
	return {
		url: `http://127.0.0.1:${port}/`,
		port,
		token,
		stop: () => server.stop(true),
	};
}
