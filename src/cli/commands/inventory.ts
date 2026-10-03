import { parseArgs } from "node:util";
import { refreshInventory } from "../../core/inventory/refresh.ts";
import type { ScanResult } from "../../core/inventory/scan.ts";
import type { WriteResult } from "../../core/inventory/store.ts";
import { toPortable } from "../../core/paths.ts";
import {
	defaultUpstreamDeps,
	tallyUpstream,
	type UpstreamDeps,
	type UpstreamReport,
} from "../../core/upstream/index.ts";
import {
	type Env,
	resolveWorkspace,
	type Workspace,
} from "../../core/workspace.ts";
import type { Io } from "../io.ts";

export async function inventoryCommand(
	args: string[],
	io: Io,
	env: Env,
	upstreamDeps: () => UpstreamDeps = () => defaultUpstreamDeps(env.githubToken),
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { home: { type: "string" }, check: { type: "boolean" } },
		strict: true,
	});
	const ws = resolveWorkspace(env, values.home);
	let token: string | undefined;
	const { upstream } = await refreshInventory(ws, env.homeDir, {
		check: Boolean(values.check),
		upstream: () => {
			const deps = upstreamDeps();
			token = deps.token;
			return deps;
		},
		onScanned: (result, written) => {
			printScan(io, ws, env, result, written);
			if (values.check) {
				io.out("");
				io.out("Checking upstream...");
			}
		},
	});
	if (upstream) printCheck(io, upstream, Boolean(token));
	return 0;
}

function printScan(
	io: Io,
	ws: Workspace,
	env: Env,
	result: ScanResult,
	written: WriteResult,
): void {
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
	const d = s.deployments;
	if (d) {
		const parts = [`${d.deployed} deployed`];
		if (d.takenBack > 0)
			parts.push(`${d.takenBack} taken back by another tool`);
		if (d.missing > 0) parts.push(`${d.missing} missing`);
		io.out(
			`Deployments: ${parts.join(", ")}.${d.takenBack + d.missing > 0 ? " Run `skillctx deploy` to see which." : ""}`,
		);
	}
	for (const w of s.warnings) io.err(`warning: ${w}`);
	io.out("");
	io.out(
		`Wrote ${toPortable(ws.resolve("inventory"), env.homeDir)}: ${written.written} updated, ${written.unchanged} unchanged, ${written.removed} removed.`,
	);
}

function printCheck(
	io: Io,
	report: UpstreamReport,
	authenticated: boolean,
): void {
	const t = tallyUpstream(report);
	io.out(
		`${report.requests} requests${authenticated ? "" : " (unauthenticated)"}: ${t.skills["up-to-date"]} up to date, ${t.skills.outdated} outdated, ${t.skills["missing-upstream"]} missing upstream, ${t.skills.error} errors.`,
	);
	if (t.outdated.length > 0) io.out(`Outdated: ${t.outdated.join(", ")}`);
	for (const e of t.errors) io.err(`error: ${e}`);
}
