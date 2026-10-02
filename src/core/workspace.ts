import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fromPortable, isInside, toPortable } from "./paths.ts";

export const WORKSPACE_FILE = "skillctx.yaml";
export const WORKSPACE_VERSION = 1;

/** Directories every workspace has (ADR-009). Most stay empty until later phases. */
export const LAYOUT = [
	"inventory",
	"variants",
	"profiles",
	"projects",
	"compiled",
	".cache",
] as const;

const GITIGNORE = `# Rebuildable caches and per-machine settings (ADR-009)
.cache/
local.yaml
`;

const WORKSPACE_YAML = `# skillctx workspace (ADR-009). Plain text, safe to commit.
version: ${WORKSPACE_VERSION}
# Extra skill roots to scan, besides the built-in ones. Use ~/ paths.
roots: []
`;

export class WorkspaceError extends Error {
	override name = "WorkspaceError";
}

export interface Env {
	/** User home directory. Injected so tests never touch the real one. */
	homeDir: string;
	/** Directory holding the pointer file (config.json). */
	configDir: string;
}

export function defaultEnv(): Env {
	const homeDir = os.homedir();
	const xdg = process.env.XDG_CONFIG_HOME;
	return {
		homeDir,
		configDir: path.join(xdg || path.join(homeDir, ".config"), "skillctx"),
	};
}

/** A workspace on disk. All writes go through `write`, which refuses paths outside the root. */
export class Workspace {
	constructor(readonly root: string) {}

	resolve(relPath: string): string {
		const target = path.resolve(this.root, relPath);
		if (!isInside(this.root, target)) {
			throw new WorkspaceError(
				`Refusing to write outside the workspace: ${target}`,
			);
		}
		return target;
	}

	/** Atomic write: temp file in the same directory, then rename. Skips identical content. */
	write(relPath: string, content: string): boolean {
		const target = this.resolve(relPath);
		if (existsSync(target) && readFileSync(target, "utf8") === content)
			return false;
		mkdirSync(path.dirname(target), { recursive: true });
		const tmp = `${target}.tmp-${process.pid}`;
		writeFileSync(tmp, content);
		renameSync(tmp, target);
		return true;
	}

	/** Delete a file inside the workspace. Returns false if it didn't exist. */
	remove(relPath: string): boolean {
		const target = this.resolve(relPath);
		if (!existsSync(target)) return false;
		rmSync(target);
		return true;
	}

	/** File names directly inside a workspace folder; empty if the folder is missing. */
	list(relDir: string): string[] {
		const dir = this.resolve(relDir);
		return existsSync(dir) ? readdirSync(dir) : [];
	}
}

export function isWorkspace(dir: string): boolean {
	return existsSync(path.join(dir, WORKSPACE_FILE));
}

export interface InitResult {
	workspace: Workspace;
	created: boolean;
}

/**
 * Create a workspace at `homeArg` (a `~/` path or any path) and point the
 * config at it. Running it again on an existing workspace only fills gaps.
 */
export function initWorkspace(homeArg: string, env: Env): InitResult {
	const root = fromPortable(homeArg, env.homeDir);
	const existed = isWorkspace(root);

	if (!existed && existsSync(root) && readdirSync(root).length > 0) {
		throw new WorkspaceError(
			`${root} is not empty and is not a skillctx workspace. Choose an empty or new folder.`,
		);
	}

	mkdirSync(root, { recursive: true });
	const ws = new Workspace(root);
	for (const dir of LAYOUT) mkdirSync(ws.resolve(dir), { recursive: true });
	if (!existed) ws.write(WORKSPACE_FILE, WORKSPACE_YAML);
	if (!existsSync(ws.resolve(".gitignore"))) ws.write(".gitignore", GITIGNORE);

	writePointer(root, env);
	return { workspace: ws, created: !existed };
}

function pointerPath(env: Env): string {
	return path.join(env.configDir, "config.json");
}

function writePointer(root: string, env: Env): void {
	mkdirSync(env.configDir, { recursive: true });
	const body = `${JSON.stringify({ home: toPortable(root, env.homeDir) }, null, 2)}\n`;
	writeFileSync(pointerPath(env), body);
}

/** Find the active workspace: explicit flag, then SKILLCTX_HOME, then the pointer file. */
export function resolveWorkspace(env: Env, flag?: string): Workspace {
	const fromEnv = process.env.SKILLCTX_HOME;
	let candidate = flag ?? fromEnv;
	if (!candidate && existsSync(pointerPath(env))) {
		const parsed = JSON.parse(readFileSync(pointerPath(env), "utf8")) as {
			home?: string;
		};
		candidate = parsed.home;
	}
	if (!candidate) {
		throw new WorkspaceError(
			"No workspace found. Run `skillctx init --home <path>` first.",
		);
	}
	const root = fromPortable(candidate, env.homeDir);
	if (!isWorkspace(root)) {
		throw new WorkspaceError(
			`${root} is not a skillctx workspace. Run \`skillctx init --home ${candidate}\`.`,
		);
	}
	return new Workspace(root);
}
