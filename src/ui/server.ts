import { randomBytes } from "node:crypto";
import type { Workspace } from "../core/workspace.ts";
import index from "./client/index.html";
import { InventoryStore } from "./data.ts";

export interface RefreshResult {
	ok: boolean;
	message: string;
}

export interface UiServerOptions {
	ws: Workspace;
	homeDir: string;
	/** 0 picks a free port. */
	port?: number;
	/** Rescan, optionally followed by an upstream check. */
	refresh: (check: boolean) => Promise<RefreshResult>;
}

export interface UiServer {
	url: string;
	port: number;
	token: string;
	stop: () => void;
}

type Handler<R extends Request = Request> = (
	req: R,
) => Response | Promise<Response>;

/**
 * Local-only UI server (ADR-005, ADR-010). Binds to 127.0.0.1. Every API
 * route rejects requests whose Host isn't this server, which blocks DNS
 * rebinding from reading the inventory. The one route that does work
 * (refresh) also needs a per-session token and a same-origin request;
 * cross-origin pages can't read /api/session, so they can't get the token.
 */
export function startUiServer(opts: UiServerOptions): UiServer {
	const store = new InventoryStore(opts.ws, opts.homeDir);
	const token = randomBytes(24).toString("hex");
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

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: opts.port ?? 0,
		development: false,
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
					const diff = store.diff(
						decodeURIComponent(req.params.name),
						Number(url.searchParams.get("a")),
						Number(url.searchParams.get("b")),
					);
					return diff
						? Response.json(diff)
						: Response.json({ error: "Not found" }, { status: 404 });
				},
			),
			"/api/refresh": {
				POST: guard(async (req) => {
					const origin = req.headers.get("origin");
					const sameOrigin =
						!origin ||
						origin === `http://127.0.0.1:${port}` ||
						origin === `http://localhost:${port}`;
					if (req.headers.get("x-skillctx-token") !== token || !sameOrigin) {
						return Response.json({ error: "Forbidden" }, { status: 403 });
					}
					if (refreshing) {
						return Response.json(
							{ error: "A refresh is already running" },
							{ status: 409 },
						);
					}
					const body = (await req.json().catch(() => ({}))) as {
						check?: boolean;
					};
					refreshing = true;
					try {
						return Response.json(await opts.refresh(Boolean(body.check)));
					} finally {
						refreshing = false;
					}
				}),
			},
		},
		fetch: () => new Response("Not found", { status: 404 }),
	});

	port = server.port ?? 0;
	return {
		url: `http://127.0.0.1:${port}/`,
		port,
		token,
		stop: () => server.stop(true),
	};
}
