import { parseArgs } from "node:util";
import { scan, writeInventory, writeUpstream } from "../../core/inventory.ts";
import { toPortable } from "../../core/paths.ts";
import {
	type CheckDeps,
	checkUpstream,
	githubToken,
	gitLsRemote,
} from "../../core/upstream/index.ts";
import { type Env, resolveWorkspace } from "../../core/workspace.ts";
import type { Io } from "../io.ts";

/** Network access for --check; injectable so tests never hit the network. */
export type UpstreamDeps = Omit<CheckDeps, "homeDir">;

export function defaultUpstreamDeps(env: Env): UpstreamDeps {
	return { fetch, token: githubToken(env.githubToken), lsRemote: gitLsRemote };
}

export async function inventoryCommand(
	args: string[],
	io: Io,
	env: Env,
	upstreamDeps: () => UpstreamDeps = () => defaultUpstreamDeps(env),
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { home: { type: "string" }, check: { type: "boolean" } },
		strict: true,
	});
	const ws = resolveWorkspace(env, values.home);
	const result = scan(ws, env.homeDir);
	const written = writeInventory(ws, result, env.homeDir);
	const s = result.summary;

	io.out(
		`Scanned ${s.entries} skill folders in ${s.roots.filter((r) => r.present).length} roots:`,
	);
	const width = Math.max(...s.roots.map((r) => r.path.length));
	for (const r of s.roots) {
		io.out(
			`  ${r.path.padEnd(width)}  ${r.present ? `${r.entries}` : "not found"}`,
		);
	}
	io.out("");
	io.out(`${s.skills} skills, ${s.copies} distinct folders on disk.`);
	if (s.drifted > 0)
		io.out(`${s.drifted} skills have copies with different content (drift).`);
	if (s.modifiedSinceInstall > 0)
		io.out(`${s.modifiedSinceInstall} skills were edited after install.`);
	if (s.withDiagnostics > 0)
		io.out(
			`${s.withDiagnostics} skills have warnings (missing name, bad frontmatter, ...).`,
		);
	const sources = Object.entries(s.sources)
		.map(([k, n]) => `${k} ${n}`)
		.join(", ");
	io.out(`Sources: ${sources}`);
	for (const w of s.warnings) io.err(`warning: ${w}`);
	io.out("");
	io.out(
		`Wrote ${toPortable(ws.resolve("inventory"), env.homeDir)}: ${written.written} updated, ${written.unchanged} unchanged, ${written.removed} removed.`,
	);

	if (!values.check) return 0;

	io.out("");
	io.out("Checking upstream...");
	const deps = upstreamDeps();
	const report = await checkUpstream(result.skills, {
		...deps,
		homeDir: env.homeDir,
	});
	writeUpstream(ws, report);
	const count = (status: string) =>
		new Set(
			report.results.filter((r) => r.status === status).map((r) => r.skill),
		).size;
	io.out(
		`${report.requests} requests${deps.token ? "" : " (unauthenticated)"}: ${count("up-to-date")} up to date, ${count("outdated")} outdated, ${count("missing-upstream")} missing upstream, ${count("error")} errors.`,
	);
	const outdated = [
		...new Set(
			report.results.filter((r) => r.status === "outdated").map((r) => r.skill),
		),
	];
	if (outdated.length > 0) io.out(`Outdated: ${outdated.join(", ")}`);
	const errors = [
		...new Set(
			report.results.filter((r) => r.error).map((r) => r.error as string),
		),
	];
	for (const e of errors) io.err(`error: ${e}`);
	return 0;
}
