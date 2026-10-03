import {
	copyFileSync,
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

/** Directories every workspace has (ADR-009, ADR-023). Some stay empty until later phases. */
export const LAYOUT = [
	"inventory",
	"library",
	"build",
	"local",
	"variants",
	"profiles",
	"projects",
	"compiled",
	".cache",
] as const;

/** Lines every workspace's .gitignore must contain (ADR-009, ADR-023). */
export const IGNORED = [
	".cache/",
	"local.yaml",
	"local/",
	"build/",
	"library/fetched/",
] as const;

const GITIGNORE = `# Rebuildable caches and per-machine state (ADR-009, ADR-023)
${IGNORED.join("\n")}
`;

const WORKSPACE_YAML = `# skillctx workspace (ADR-009). Plain text, safe to commit.
version: ${WORKSPACE_VERSION}
# Extra skill roots to scan, besides the built-in ones. Use ~/ paths.
roots: []
`;

/** What skillctx.yaml says. Grows as later phases add settings. */
export interface WorkspaceConfig {
	/** Extra skill roots to scan, as `~/` or absolute paths. */
	roots: string[];
}

export class WorkspaceError extends Error {
	override name = "WorkspaceError";
}

export interface Env {
	/** User home directory. Injected so tests never touch the real one. */
	homeDir: string;
	/** Directory holding the pointer file (config.json). */
	configDir: string;
	/** SKILLCTX_HOME: overrides the pointer file. */
	skillctxHome?: string;
	/** GITHUB_TOKEN for upstream checks. */
	githubToken?: string;
}

export function defaultEnv(): Env {
	const homeDir = os.homedir();
	const xdg = process.env.XDG_CONFIG_HOME;
	return {
		homeDir,
		configDir: path.join(xdg || path.join(homeDir, ".config"), "skillctx"),
		skillctxHome: process.env.SKILLCTX_HOME || undefined,
		githubToken: process.env.GITHUB_TOKEN || undefined,
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

	/**
	 * Replace the folder `relDir` with copies of `files` (relative paths) from
	 * `sourceDir`. The copy is written next to the target and renamed into place,
	 * so a failure leaves the old folder intact.
	 */
	replaceFolder(
		relDir: string,
		sourceDir: string,
		files: readonly string[],
	): void {
		const target = this.resolve(relDir);
		const tmp = this.resolve(`${relDir}.tmp-${process.pid}`);
		rmSync(tmp, { recursive: true, force: true });
		try {
			mkdirSync(tmp, { recursive: true });
			for (const rel of files) {
				const dest = path.join(tmp, rel);
				if (!isInside(tmp, dest))
					throw new WorkspaceError(
						`Refusing to copy outside the workspace: ${rel}`,
					);
				mkdirSync(path.dirname(dest), { recursive: true });
				copyFileSync(path.join(sourceDir, rel), dest);
			}
		} catch (error) {
			rmSync(tmp, { recursive: true, force: true });
			throw error;
		}
		rmSync(target, { recursive: true, force: true });
		mkdirSync(path.dirname(target), { recursive: true });
		renameSync(tmp, target);
	}

	/** Delete a folder inside the workspace and everything in it. */
	removeFolder(relDir: string): boolean {
		const target = this.resolve(relDir);
		if (!existsSync(target)) return false;
		rmSync(target, { recursive: true });
		return true;
	}

	/** Delete a file inside the workspace. Returns false if it didn't exist. */
	remove(relPath: string): boolean {
		const target = this.resolve(relPath);
		if (!existsSync(target)) return false;
		rmSync(target);
		return true;
	}

	/** Text of a workspace file, or undefined if it doesn't exist. */
	read(relPath: string): string | undefined {
		const target = this.resolve(relPath);
		return existsSync(target) ? readFileSync(target, "utf8") : undefined;
	}

	/** Parsed skillctx.yaml. Unknown or malformed keys fall back to defaults. */
	config(): WorkspaceConfig {
		const text = this.read(WORKSPACE_FILE);
		const parsed = (text ? Bun.YAML.parse(text) : null) as {
			roots?: unknown;
		} | null;
		const roots = Array.isArray(parsed?.roots) ? parsed.roots : [];
		return {
			roots: roots.filter(
				(r): r is string => typeof r === "string" && r.length > 0,
			),
		};
	}

	/** File names directly inside a workspace folder; empty if the folder is missing. */
	list(relDir: string): string[] {
		const dir = this.resolve(relDir);
		return existsSync(dir) ? readdirSync(dir) : [];
	}
}

/**
 * Add any missing layout folders and .gitignore lines. Workspaces made by an
 * older skillctx gain what later phases need; existing lines and user
 * additions are kept. Running it again changes nothing.
 */
export function ensureLayout(ws: Workspace): void {
	for (const dir of LAYOUT) mkdirSync(ws.resolve(dir), { recursive: true });
	const current = ws.read(".gitignore");
	if (current === undefined) {
		ws.write(".gitignore", GITIGNORE);
		return;
	}
	const have = new Set(current.split("\n").map((l) => l.trim()));
	const missing = IGNORED.filter((line) => !have.has(line));
	if (missing.length === 0) return;
	const sep = current.endsWith("\n") || current === "" ? "" : "\n";
	ws.write(".gitignore", `${current}${sep}${missing.join("\n")}\n`);
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
	if (!existed) ws.write(WORKSPACE_FILE, WORKSPACE_YAML);
	ensureLayout(ws);

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

/** Find the active workspace: explicit flag, then env.skillctxHome, then the pointer file. */
export function resolveWorkspace(env: Env, flag?: string): Workspace {
	let candidate = flag ?? env.skillctxHome;
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
