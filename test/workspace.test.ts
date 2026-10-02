import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli/index.ts";
import { fromPortable, toPortable } from "../src/core/paths.ts";
import {
	type Env,
	initWorkspace,
	LAYOUT,
	resolveWorkspace,
	Workspace,
	WorkspaceError,
} from "../src/core/workspace.ts";

let tmp: string;
let env: Env;

beforeEach(() => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-ws-"));
	env = {
		homeDir: path.join(tmp, "home"),
		configDir: path.join(tmp, "home/.config/skillctx"),
	};
	mkdirSync(env.homeDir, { recursive: true });
	delete process.env.SKILLCTX_HOME;
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function quietIo() {
	const out: string[] = [];
	const err: string[] = [];
	return {
		io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) },
		out,
		err,
	};
}

describe("paths", () => {
	test("home-relative paths round-trip as ~/", () => {
		const abs = path.join(env.homeDir, "a/b");
		expect(toPortable(abs, env.homeDir)).toBe("~/a/b");
		expect(fromPortable("~/a/b", env.homeDir)).toBe(abs);
	});

	test("paths outside home stay absolute", () => {
		expect(toPortable("/opt/skills", env.homeDir)).toBe("/opt/skills");
	});
});

describe("initWorkspace", () => {
	test("creates the layout, config files and pointer", () => {
		const { workspace, created } = initWorkspace("~/sk", env);
		expect(created).toBe(true);
		for (const dir of LAYOUT)
			expect(existsSync(path.join(workspace.root, dir))).toBe(true);
		expect(
			readFileSync(path.join(workspace.root, "skillctx.yaml"), "utf8"),
		).toContain("version: 1");
		expect(
			readFileSync(path.join(workspace.root, ".gitignore"), "utf8"),
		).toContain(".cache/");
		const pointer = JSON.parse(
			readFileSync(path.join(env.configDir, "config.json"), "utf8"),
		);
		expect(pointer).toEqual({ home: "~/sk" });
	});

	test("running twice changes nothing and keeps user edits", () => {
		const { workspace } = initWorkspace("~/sk", env);
		const yaml = path.join(workspace.root, "skillctx.yaml");
		writeFileSync(yaml, "version: 1\nroots: [~/extra]\n");
		const again = initWorkspace("~/sk", env);
		expect(again.created).toBe(false);
		expect(readFileSync(yaml, "utf8")).toBe("version: 1\nroots: [~/extra]\n");
	});

	test("refuses a non-empty folder that is not a workspace", () => {
		const dir = path.join(env.homeDir, "busy");
		mkdirSync(dir);
		writeFileSync(path.join(dir, "notes.txt"), "hi");
		expect(() => initWorkspace("~/busy", env)).toThrow(WorkspaceError);
	});
});

describe("Workspace.write guard", () => {
	test("refuses paths outside the workspace", () => {
		const { workspace } = initWorkspace("~/sk", env);
		expect(() => workspace.write("../escape.txt", "x")).toThrow(WorkspaceError);
		expect(() => workspace.write("/etc/passwd", "x")).toThrow(WorkspaceError);
		expect(existsSync(path.join(env.homeDir, "escape.txt"))).toBe(false);
	});

	test("writes inside and reports unchanged content", () => {
		const ws = new Workspace(initWorkspace("~/sk", env).workspace.root);
		expect(ws.write("inventory/a.json", "{}\n")).toBe(true);
		expect(ws.write("inventory/a.json", "{}\n")).toBe(false);
	});
});

describe("resolveWorkspace", () => {
	test("uses the pointer written by init", () => {
		initWorkspace("~/sk", env);
		expect(resolveWorkspace(env).root).toBe(path.join(env.homeDir, "sk"));
	});

	test("explicit flag wins and must be a workspace", () => {
		initWorkspace("~/sk", env);
		expect(() => resolveWorkspace(env, "~/other")).toThrow(WorkspaceError);
	});

	test("errors clearly when nothing is set up", () => {
		expect(() => resolveWorkspace(env)).toThrow(/skillctx init/);
	});
});

describe("init command", () => {
	test("init --home creates the workspace and exits 0", async () => {
		const { io, out } = quietIo();
		expect(await main(["init", "--home", "~/sk"], io, env)).toBe(0);
		expect(out[0]).toBe("Created workspace at ~/sk");
	});

	test("non-empty folder exits 1 with a message", async () => {
		mkdirSync(path.join(env.homeDir, "busy"));
		writeFileSync(path.join(env.homeDir, "busy/x"), "x");
		const { io, err } = quietIo();
		expect(await main(["init", "--home", "~/busy"], io, env)).toBe(1);
		expect(err[0]).toContain("not empty");
	});

	test("unknown flag exits 2", async () => {
		const { io } = quietIo();
		expect(await main(["init", "--nope"], io, env)).toBe(2);
	});
});

describe("toPortable with a symlinked home", () => {
	test("real paths under a symlinked home still become ~/", () => {
		const realHome = path.join(tmp, "real-home");
		const linkHome = path.join(tmp, "link-home");
		mkdirSync(path.join(realHome, "x"), { recursive: true });
		symlinkSync(realHome, linkHome);
		expect(toPortable(path.join(realpathSync(realHome), "x"), linkHome)).toBe(
			"~/x",
		);
	});
});
