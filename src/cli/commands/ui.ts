import { parseArgs } from "node:util";
import { scan } from "../../core/inventory/scan.ts";
import { writeInventory, writeUpstream } from "../../core/inventory/store.ts";
import { checkUpstream } from "../../core/upstream/index.ts";
import {
	type Env,
	resolveWorkspace,
	type Workspace,
} from "../../core/workspace.ts";
import { type RefreshResult, startUiServer } from "../../ui/server.ts";
import type { Io } from "../io.ts";
import { defaultUpstreamDeps, type UpstreamDeps } from "./inventory.ts";

/** Rescan (and optionally check upstream), the same work `inventory [--check]` does. */
export function makeRefresh(
	ws: Workspace,
	env: Env,
	upstreamDeps: () => UpstreamDeps = () => defaultUpstreamDeps(env),
): (check: boolean) => Promise<RefreshResult> {
	const { homeDir } = env;
	return async (check) => {
		const result = scan(ws, homeDir);
		const written = writeInventory(ws, result, homeDir);
		let message = `Scanned ${result.summary.skills} skills: ${written.written} updated, ${written.removed} removed.`;
		if (check) {
			const report = await checkUpstream(result.skills, {
				...upstreamDeps(),
				homeDir,
			});
			writeUpstream(ws, report);
			const outdated = new Set(
				report.results
					.filter((r) => r.status === "outdated")
					.map((r) => r.skill),
			).size;
			const errors = report.results.filter((r) => r.status === "error").length;
			message += ` Checked upstream with ${report.requests} requests: ${outdated} outdated${errors ? `, ${errors} errors` : ""}.`;
		}
		return { ok: true, message };
	};
}

function openBrowser(url: string): void {
	const cmd =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "explorer"
				: "xdg-open";
	try {
		Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
	} catch {
		// No browser available; the URL is printed anyway.
	}
}

export async function uiCommand(
	args: string[],
	io: Io,
	env: Env,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			home: { type: "string" },
			port: { type: "string" },
			"no-open": { type: "boolean" },
		},
		strict: true,
	});
	const ws = resolveWorkspace(env, values.home);
	const server = startUiServer({
		ws,
		homeDir: env.homeDir,
		port: values.port ? Number(values.port) : 4317,
		refresh: makeRefresh(ws, env),
	});
	io.out(
		`skillctx UI running at ${server.url} (local only). Press Ctrl+C to stop.`,
	);
	if (!values["no-open"]) openBrowser(server.url);

	await new Promise<void>((resolve) => {
		const stop = () => {
			server.stop();
			resolve();
		};
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
	});
	return 0;
}
