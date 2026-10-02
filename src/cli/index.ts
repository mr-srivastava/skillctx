#!/usr/bin/env bun
import pkg from "../../package.json" with { type: "json" };
import { defaultEnv, type Env, WorkspaceError } from "../core/workspace.ts";
import { initCommand } from "./commands/init.ts";
import { inventoryCommand } from "./commands/inventory.ts";
import { consoleIo, type Io } from "./io.ts";

export const VERSION: string = pkg.version;

const USAGE = `skillctx ${VERSION}

Usage:
  skillctx init [--home <path>]   Create a workspace (default ~/skillctx) and make it active
  skillctx inventory [--check]    Scan all skill roots and write <workspace>/inventory/
                                  --check also compares with upstream (network)
  skillctx --version
  skillctx --help
`;

type Command = (args: string[], io: Io, env: Env) => Promise<number>;

const COMMANDS: Record<string, Command> = {
	init: initCommand,
	inventory: inventoryCommand,
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
