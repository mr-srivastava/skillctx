#!/usr/bin/env bun
import pkg from "../../package.json" with { type: "json" };
import { defaultEnv, type Env, WorkspaceError } from "../core/workspace.ts";
import { adoptCommand } from "./commands/adopt.ts";
import { deployCommand, undeployCommand } from "./commands/deploy.ts";
import { importCommand } from "./commands/import.ts";
import { initCommand } from "./commands/init.ts";
import { inventoryCommand } from "./commands/inventory.ts";
import { uiCommand } from "./commands/ui.ts";
import { consoleIo, type Io } from "./io.ts";

export const VERSION: string = pkg.version;

const USAGE = `skillctx ${VERSION}

Usage:
  skillctx init [--home <path>]   Create a workspace (default ~/skillctx) and make it active
  skillctx inventory [--check]    Scan all skill roots and write <workspace>/inventory/
                                  --check also compares with upstream (network)
  skillctx ui [--port N] [--no-open]
                                  Browse the inventory in a local web page
  skillctx adopt <skill> [--copy N]
                                  Snapshot an installed skill into the library
                                  (the original is never changed)
  skillctx deploy <skill> --agent claude,codex,cursor,gemini,opencode
          [--copy-mode] [--replace] [--dry-run]
                                  Show the plan, then link the skill into the
                                  agents' folders. --replace confirms replacing
                                  other tools' links
  skillctx deploy                 List deployments and whether they're intact
  skillctx undeploy <skill> [--dry-run]
                                  Remove our entries and put back replaced links
  skillctx import skills-manager [--dry-run]
                                  Adopt Skills Manager's library, keeping its
                                  presets and tags (it is never changed)
  skillctx --version
  skillctx --help
`;

type Command = (args: string[], io: Io, env: Env) => Promise<number>;

const COMMANDS: Record<string, Command> = {
	adopt: adoptCommand,
	deploy: deployCommand,
	undeploy: undeployCommand,
	import: importCommand,
	init: initCommand,
	inventory: inventoryCommand,
	ui: uiCommand,
};

export async function main(
	argv: string[],
	io: Io = consoleIo,
	env: Env = defaultEnv(),
): Promise<number> {
	const [first, ...rest] = argv;

	if (first === "--version" || first === "-v") {
		io.out(VERSION);
		return 0;
	}
	if (first === undefined || first === "--help" || first === "-h") {
		io.out(USAGE);
		return 0;
	}

	const command = COMMANDS[first];
	if (!command) {
		io.err(`Unknown command: ${first}\n\n${USAGE}`);
		return 2;
	}

	try {
		return await command(rest, io, env);
	} catch (error) {
		if (error instanceof WorkspaceError) {
			io.err(error.message);
			return 1;
		}
		if (
			error instanceof TypeError &&
			"code" in error &&
			String(error.code).startsWith("ERR_PARSE_ARGS")
		) {
			io.err(`${error.message}\n\n${USAGE}`);
			return 2;
		}
		throw error;
	}
}

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
