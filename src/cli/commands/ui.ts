import { parseArgs } from "node:util";
import { refreshInventory } from "../../core/inventory/refresh.ts";
import { defaultUpstreamDeps } from "../../core/upstream/index.ts";
import { type Env, resolveWorkspace } from "../../core/workspace.ts";
import { startUiServer } from "../../ui/server.ts";
import type { Io } from "../io.ts";

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
			dev: { type: "boolean" },
		},
		strict: true,
	});
	const ws = resolveWorkspace(env, values.home);
	const server = startUiServer({
		ws,
		homeDir: env.homeDir,
		port: values.port ? Number(values.port) : 4317,
		dev: values.dev,
		refresh: (check) =>
			refreshInventory(ws, env.homeDir, {
				check,
				upstream: () => defaultUpstreamDeps(env.githubToken),
			}),
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
