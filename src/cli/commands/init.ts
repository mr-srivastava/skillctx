import { parseArgs } from "node:util";
import { toPortable } from "../../core/paths.ts";
import { type Env, initWorkspace, LAYOUT } from "../../core/workspace.ts";
import type { Io } from "../io.ts";

export const DEFAULT_HOME = "~/skillctx";

export async function initCommand(
	args: string[],
	io: Io,
	env: Env,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { home: { type: "string" } },
		strict: true,
	});
	const home = values.home ?? DEFAULT_HOME;

	const { workspace, created } = initWorkspace(home, env);
	const shown = toPortable(workspace.root, env.homeDir);

	if (created) {
		io.out(`Created workspace at ${shown}`);
		io.out(
			`  ${["skillctx.yaml", ".gitignore", ...LAYOUT.map((d) => `${d}/`)].join("  ")}`,
		);
		io.out("");
		io.out("Next: skillctx inventory");
		io.out(`Optional backup: cd ${shown} && git init`);
	} else {
		io.out(`Workspace already set up at ${shown}; now the active workspace.`);
	}
	return 0;
}
