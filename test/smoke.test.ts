import { describe, expect, test } from "bun:test";
import { main, VERSION } from "../src/cli/index.ts";

function capture() {
	const out: string[] = [];
	const err: string[] = [];
	return {
		io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) },
		out,
		err,
	};
}

describe("cli", () => {
	test("--version prints the package version", async () => {
		const { io, out } = capture();
		expect(await main(["--version"], io)).toBe(0);
		expect(out).toEqual([VERSION]);
	});

	test("unknown command exits 2 with usage", async () => {
		const { io, err } = capture();
		expect(await main(["nope"], io)).toBe(2);
		expect(err.join("\n")).toContain("Unknown command: nope");
	});
});
