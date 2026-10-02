#!/usr/bin/env bun
import pkg from "../../package.json" with { type: "json" };

export const VERSION: string = pkg.version;

const USAGE = `skillctx ${VERSION}

Usage:
  skillctx --version
  skillctx --help
`;

export interface Io {
	out: (line: string) => void;
	err: (line: string) => void;
}

const consoleIo: Io = {
	out: (line) => console.log(line),
	err: (line) => console.error(line),
};

export async function main(
	argv: string[],
	io: Io = consoleIo,
): Promise<number> {
	const [first] = argv;

	if (first === "--version" || first === "-v") {
		io.out(VERSION);
		return 0;
	}
	if (first === undefined || first === "--help" || first === "-h") {
		io.out(USAGE);
		return 0;
	}

	io.err(`Unknown command: ${first}\n\n${USAGE}`);
	return 2;
}

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
