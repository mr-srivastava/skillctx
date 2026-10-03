import { parseArgs } from "node:util";
import { importSkillsManager } from "../../core/library/skills-manager.ts";
import { type Env, resolveWorkspace } from "../../core/workspace.ts";
import type { Io } from "../io.ts";

export async function importCommand(
	args: string[],
	io: Io,
	env: Env,
	now: () => string = () => new Date().toISOString(),
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { home: { type: "string" }, "dry-run": { type: "boolean" } },
		allowPositionals: true,
		strict: true,
	});
	if (positionals.length !== 1 || positionals[0] !== "skills-manager") {
		io.err("Usage: skillctx import skills-manager [--dry-run]");
		return 2;
	}
	const ws = resolveWorkspace(env, values.home);
	const dryRun = Boolean(values["dry-run"]);
	const outcomes = importSkillsManager(ws, env.homeDir, { now: now(), dryRun });
	if (!outcomes) {
		io.err(
			"No Skills Manager library found (~/.skills-manager/skills-manager.db).",
		);
		return 1;
	}
	const count = (s: string) => outcomes.filter((o) => o.status === s).length;
	for (const skipped of outcomes.filter((o) => o.status === "skipped"))
		io.err(`skipped ${skipped.name}: ${skipped.reason}`);
	io.out(
		`${dryRun ? "Would adopt" : "Adopted"} ${count("adopted")} skills from Skills Manager; ${count("unchanged")} already in the library; ${count("skipped")} skipped.`,
	);
	if (!dryRun)
		io.out(
			"Its presets and tags are kept in the lockfile for profiles (Phase 3). Skills Manager itself is unchanged.",
		);
	return 0;
}
