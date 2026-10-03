import { parseArgs } from "node:util";
import { adopt } from "../../core/library/adopt.ts";
import { snapshotDir } from "../../core/library/format.ts";
import { type Env, resolveWorkspace } from "../../core/workspace.ts";
import type { Io } from "../io.ts";

export async function adoptCommand(
	args: string[],
	io: Io,
	env: Env,
	now: () => string = () => new Date().toISOString(),
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { home: { type: "string" }, copy: { type: "string" } },
		allowPositionals: true,
		strict: true,
	});
	const [name] = positionals;
	if (!name || positionals.length > 1) {
		io.err("Usage: skillctx adopt <skill> [--copy N]");
		return 2;
	}
	const copy = values.copy === undefined ? undefined : Number(values.copy) - 1;
	if (copy !== undefined && !(Number.isInteger(copy) && copy >= 0)) {
		io.err("--copy takes a copy number: 1, 2, ...");
		return 2;
	}
	const ws = resolveWorkspace(env, values.home);
	const result = adopt(ws, env.homeDir, { name, copy, now: now() });
	const where = snapshotDir(name, result.entry.snapshot);
	if (result.status === "unchanged") {
		io.out(`${name} is already in the library (${where}).`);
		return 0;
	}
	io.out(
		`Adopted ${name} (copy ${result.copy + 1}) from ${result.entry.adoptedFrom}.`,
	);
	io.out(
		result.entry.snapshot === "fetched"
			? `Snapshot in ${where}, not committed: it can be fetched again from upstream.`
			: `Snapshot in ${where}, committed with the workspace: nothing else could restore it.`,
	);
	io.out(
		`The original is unchanged. Deploy it with \`skillctx deploy ${name} --agent <agents>\`.`,
	);
	return 0;
}
