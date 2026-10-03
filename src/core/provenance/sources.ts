import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseSkillMd } from "../indexer/parse.ts";
import { isInside, tryRealpath } from "../paths.ts";
import type { Provenance } from "./types.ts";

/** Lookups take a copy's real path and return what each tool recorded about it. */
export type ProvenanceLookup = (realPath: string) => Provenance[];

const str = (v: unknown): string | undefined =>
	typeof v === "string" && v ? v : undefined;

/**
 * ~/.agents/.skill-lock.json, shared by `npx skills` and `gh skill`. Keys are
 * folder names under ~/.agents/skills. Unknown versions or a broken file yield
 * nothing plus a warning.
 */
export function skillLockLookup(
	homeDir: string,
	warn: (msg: string) => void,
): ProvenanceLookup {
	const file = path.join(homeDir, ".agents/.skill-lock.json");
	const byReal = new Map<string, Provenance>();
	if (existsSync(file)) {
		try {
			const parsed = JSON.parse(readFileSync(file, "utf8")) as {
				version?: number;
				skills?: Record<string, unknown>;
			};
			if (parsed.version !== 3)
				warn(
					`~/.agents/.skill-lock.json has version ${parsed.version}; expected 3, reading best-effort`,
				);
			for (const [name, raw] of Object.entries(parsed.skills ?? {})) {
				const e = (raw ?? {}) as Record<string, unknown>;
				const real = tryRealpath(path.join(homeDir, ".agents/skills", name));
				const sourceUrl = str(e.sourceUrl);
				const folderHash = str(e.skillFolderHash);
				if (!real || !sourceUrl || !folderHash) continue;
				byReal.set(real, {
					kind: "skill-lock",
					source: str(e.source) ?? sourceUrl,
					sourceType: str(e.sourceType) ?? "unknown",
					sourceUrl,
					skillPath: str(e.skillPath),
					folderHash,
					pinnedRef: str(e.pinnedRef),
					installedAt: str(e.installedAt),
					updatedAt: str(e.updatedAt),
				});
			}
		} catch (error) {
			warn(
				`Could not read ~/.agents/.skill-lock.json: ${(error as Error).message}`,
			);
		}
	}
	return (real) => {
		const p = byReal.get(real);
		return p ? [p] : [];
	};
}

/** `gh skill install` injects github-* keys under `metadata` in SKILL.md frontmatter. */
export const ghFrontmatterLookup: ProvenanceLookup = (real) => {
	let text: string;
	try {
		text = readFileSync(path.join(real, "SKILL.md"), "utf8");
	} catch {
		return [];
	}
	const parsed = parseSkillMd(text);
	if (!parsed.ok) return [];
	const meta = parsed.value.data.metadata as
		| Record<string, unknown>
		| undefined;
	const repo = str(meta?.["github-repo"]);
	if (!repo) return [];
	return [
		{
			kind: "gh-frontmatter",
			repo,
			ref: str(meta?.["github-ref"]),
			treeSha: str(meta?.["github-tree-sha"]),
			path: str(meta?.["github-path"]),
			pinned: str(meta?.["github-pinned"]),
		},
	];
};

function git(cwd: string, args: string[]): string | undefined {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "ignore",
	});
	return proc.exitCode === 0
		? proc.stdout.toString().trim() || undefined
		: undefined;
}

/**
 * Skills that live inside a git work tree (e.g. a cloned plugin repo that
 * ~/.agents/skills symlinks into). Stops at the home directory so a dotfiles
 * repo at ~ doesn't claim every skill. One git call set per repo.
 */
export function gitCheckoutLookup(homeDir: string): ProvenanceLookup {
	const cache = new Map<string, Provenance | null>();
	const home = tryRealpath(homeDir) ?? homeDir;
	return (real) => {
		let dir = real;
		while (isInside(home, dir) && dir !== home) {
			if (existsSync(path.join(dir, ".git"))) {
				if (!cache.has(dir)) {
					const head = git(dir, ["rev-parse", "HEAD"]);
					cache.set(
						dir,
						head
							? {
									kind: "git-checkout",
									repoRoot: dir,
									head,
									remote: git(dir, ["config", "--get", "remote.origin.url"]),
									branch: git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]),
								}
							: null,
					);
				}
				const p = cache.get(dir);
				return p ? [p] : [];
			}
			dir = path.dirname(dir);
		}
		return [];
	};
}

const SKILLS_MANAGER_COLUMNS = [
	"central_path",
	"source_type",
	"source_ref",
	"source_revision",
	"remote_revision",
	"update_status",
];

/**
 * Skills Manager's SQLite library, opened read-only. Keyed by `central_path`.
 * A missing DB or unexpected schema yields nothing plus a warning.
 */
export function skillsManagerLookup(
	homeDir: string,
	warn: (msg: string) => void,
): ProvenanceLookup {
	const file = path.join(homeDir, ".skills-manager/skills-manager.db");
	const byReal = new Map<string, Provenance>();
	if (existsSync(file)) {
		let db: Database | undefined;
		try {
			db = new Database(file, { readonly: true });
			const cols = new Set(
				(db.query("PRAGMA table_info(skills)").all() as { name: string }[]).map(
					(c) => c.name,
				),
			);
			const missing = SKILLS_MANAGER_COLUMNS.filter((c) => !cols.has(c));
			if (missing.length > 0) {
				warn(
					`Skills Manager database is missing columns (${missing.join(", ")}); skipping its provenance`,
				);
			} else {
				const rows = db
					.query(`SELECT ${SKILLS_MANAGER_COLUMNS.join(", ")} FROM skills`)
					.all() as Record<string, string | null>[];
				for (const row of rows) {
					const real = row.central_path
						? tryRealpath(row.central_path)
						: undefined;
					if (!real) continue;
					byReal.set(real, {
						kind: "skills-manager",
						sourceType: row.source_type ?? "unknown",
						sourceRef: row.source_ref ?? undefined,
						sourceRevision: row.source_revision ?? undefined,
						remoteRevision: row.remote_revision ?? undefined,
						updateStatus: row.update_status ?? undefined,
					});
				}
			}
		} catch (error) {
			warn(
				`Could not read the Skills Manager database: ${(error as Error).message}`,
			);
		} finally {
			db?.close();
		}
	}
	return (real) => {
		const p = byReal.get(real);
		return p ? [p] : [];
	};
}

export interface PluginInstall {
	plugin: string;
	installPath: string;
	version?: string;
	gitCommitSha?: string;
}

/** Claude Code plugins from ~/.claude/plugins/installed_plugins.json (version 2). */
export function readClaudePlugins(
	homeDir: string,
	warn: (msg: string) => void,
): PluginInstall[] {
	const file = path.join(homeDir, ".claude/plugins/installed_plugins.json");
	if (!existsSync(file)) return [];
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as {
			plugins?: Record<string, unknown[]>;
		};
		const out: PluginInstall[] = [];
		for (const [plugin, installs] of Object.entries(parsed.plugins ?? {})) {
			for (const raw of installs ?? []) {
				const i = (raw ?? {}) as Record<string, unknown>;
				const installPath = str(i.installPath);
				if (installPath)
					out.push({
						plugin,
						installPath,
						version: str(i.version),
						gitCommitSha: str(i.gitCommitSha),
					});
			}
		}
		return out;
	} catch (error) {
		warn(`Could not read Claude plugins list: ${(error as Error).message}`);
		return [];
	}
}

export function claudePluginLookup(plugins: PluginInstall[]): ProvenanceLookup {
	const installs = plugins.map((p) => ({
		...p,
		real: tryRealpath(p.installPath) ?? p.installPath,
	}));
	return (real) =>
		installs
			.filter((p) => isInside(p.real, real))
			.map((p) => ({
				kind: "claude-plugin",
				plugin: p.plugin,
				version: p.version,
				gitCommitSha: p.gitCommitSha,
			}));
}

/** Skills the Claude desktop app syncs into ~/.claude/skills/synced/<id>/. */
export function claudeAppSyncedLookup(homeDir: string): ProvenanceLookup {
	const synced = tryRealpath(path.join(homeDir, ".claude/skills/synced"));
	return (real) =>
		synced && isInside(synced, real) ? [{ kind: "claude-app-synced" }] : [];
}

/** Combine lookups; each copy gets every provenance any tool recorded. */
export function combine(lookups: ProvenanceLookup[]): ProvenanceLookup {
	return (real) => lookups.flatMap((lookup) => lookup(real));
}
