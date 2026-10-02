import { parseArgs } from "node:util";
import { scan, writeInventory } from "../../core/inventory.ts";
import { toPortable } from "../../core/paths.ts";
import { type Env, resolveWorkspace } from "../../core/workspace.ts";
import type { Io } from "../io.ts";

export async function inventoryCommand(
	args: string[],
	io: Io,
	env: Env,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { home: { type: "string" } },
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
	return 0;
}
