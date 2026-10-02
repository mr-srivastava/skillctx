import path from "node:path";
import type { Skill } from "../indexer/index.ts";
import { toPortable } from "../paths.ts";
import { upstreamTarget } from "../provenance/kinds.ts";
import type { ProvenanceKind } from "../provenance/types.ts";

export type UpstreamStatus =
	| "up-to-date"
	| "outdated"
	| "missing-upstream"
	| "error";

export interface UpstreamResult {
	skill: string;
	/** `~/` path of the copy that was checked. */
	copy: string;
	/** The provenance kind that recorded what was installed. */
	via: ProvenanceKind;
	/** Repository URL or remote. */
	repo: string;
	/** What was installed: a tree SHA (lockfile/gh) or a commit (git checkout). */
	installed: string;
	latest?: string;
	status: UpstreamStatus;
	error?: string;
}

export interface UpstreamReport {
	checkedAt: string;
	requests: number;
	results: UpstreamResult[];
}

export interface CheckDeps {
	fetch: typeof fetch;
	/** GitHub token, if any; unauthenticated requests are limited to 60/hour. */
	token?: string;
	/** `git ls-remote <remote> <ref>`; returns the commit SHA or throws. */
	lsRemote: (remote: string, ref: string) => string | undefined;
	homeDir: string;
	now?: () => Date;
}

interface GithubTarget {
	owner: string;
	repo: string;
	ref: string;
}

/** Owner and repo from https://github.com/o/r(.git) or a bare "o/r". */
export function parseGithub(
	url: string,
): { owner: string; repo: string } | undefined {
	const m =
		/^(?:https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
			url.trim(),
		);
	return m?.[1] && m[2] ? { owner: m[1], repo: m[2] } : undefined;
}

/** Skill folder inside the repo: lockfiles store ".../SKILL.md", gh stores the folder. */
export function skillDir(p: string): string {
	const clean = p.replace(/^\/+|\/+$/g, "");
	return clean.endsWith("SKILL.md") ? path.posix.dirname(clean) : clean;
}

type TreeResult =
	| { ok: true; dirs: Map<string, string>; truncated: boolean }
	| { ok: false; error: string };

async function fetchTree(
	t: GithubTarget,
	deps: CheckDeps,
): Promise<TreeResult> {
	const url = `https://api.github.com/repos/${t.owner}/${t.repo}/git/trees/${encodeURIComponent(t.ref)}?recursive=1`;
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"User-Agent": "skillctx",
	};
	if (deps.token) headers.Authorization = `Bearer ${deps.token}`;
	try {
		const res = await deps.fetch(url, { headers });
		if (res.status === 403 || res.status === 429) {
			const reset = res.headers.get("x-ratelimit-reset");
			const when = reset
				? ` until ${new Date(Number(reset) * 1000).toLocaleTimeString()}`
				: "";
			return {
				ok: false,
				error: `GitHub rate limit reached${when}; set GITHUB_TOKEN or log in with gh`,
			};
		}
		if (res.status === 404)
			return {
				ok: false,
				error: `Repository or ref not found: ${t.owner}/${t.repo}@${t.ref}`,
			};
		if (!res.ok) return { ok: false, error: `GitHub returned ${res.status}` };
		const body = (await res.json()) as {
			tree?: { path: string; type: string; sha: string }[];
			truncated?: boolean;
		};
		const dirs = new Map<string, string>();
		for (const e of body.tree ?? [])
			if (e.type === "tree") dirs.set(e.path, e.sha);
		return { ok: true, dirs, truncated: Boolean(body.truncated) };
	} catch (error) {
		return { ok: false, error: `Network error: ${(error as Error).message}` };
	}
}

interface Pending {
	skill: string;
	copy: string;
	via: UpstreamResult["via"];
	repo: string;
	dir: string;
	installed: string;
}

/**
 * Compare installed copies with upstream. One GitHub tree request per
 * (repo, ref) and one `git ls-remote` per checkout. Only ever called for
 * `inventory --check` or the UI's explicit refresh (ADR-010).
 */
export async function checkUpstream(
	skills: Skill[],
	deps: CheckDeps,
): Promise<UpstreamReport> {
	const results: UpstreamResult[] = [];
	const byTarget = new Map<
		string,
		{ target: GithubTarget; items: Pending[] }
	>();
	const checkouts = new Map<
		string,
		{
			remote: string;
			branch: string;
			head: string;
			items: Omit<Pending, "dir">[];
		}
	>();
	let requests = 0;

	for (const skill of skills) {
		for (const copy of skill.copies) {
			const copyPath = toPortable(copy.realPath, deps.homeDir);
			for (const p of copy.provenance) {
				const t = upstreamTarget(p);
				if (t?.type === "github-tree") {
					const gh = parseGithub(t.repo);
					if (!gh) continue;
					const key = `${gh.owner}/${gh.repo}@${t.ref}`;
					const entry = byTarget.get(key) ?? {
						target: { ...gh, ref: t.ref },
						items: [],
					};
					entry.items.push({
						skill: skill.name,
						copy: copyPath,
						via: p.kind,
						repo: t.repo,
						dir: skillDir(t.path),
						installed: t.installed,
					});
					byTarget.set(key, entry);
				} else if (t?.type === "git-branch") {
					const entry = checkouts.get(t.repoRoot) ?? {
						remote: t.remote,
						branch: t.branch,
						head: t.head,
						items: [],
					};
					entry.items.push({
						skill: skill.name,
						copy: copyPath,
						via: p.kind,
						repo: t.remote,
						installed: t.head,
					});
					checkouts.set(t.repoRoot, entry);
				}
			}
		}
	}

	for (const { target, items } of byTarget.values()) {
		requests++;
		const tree = await fetchTree(target, deps);
		for (const item of items) {
			const { dir: _dir, ...base } = item;
			if (!tree.ok) {
				results.push({ ...base, status: "error", error: tree.error });
				continue;
			}
			const latest = tree.dirs.get(item.dir);
			if (!latest) {
				results.push(
					tree.truncated
						? {
								...base,
								status: "error",
								error: "Repository tree too large to list in one request",
							}
						: { ...base, status: "missing-upstream" },
				);
			} else {
				results.push({
					...base,
					latest,
					status: latest === item.installed ? "up-to-date" : "outdated",
				});
			}
		}
	}

	for (const { remote, branch, head, items } of checkouts.values()) {
		requests++;
		let latest: string | undefined;
		let error: string | undefined;
		try {
			latest = deps.lsRemote(remote, `refs/heads/${branch}`);
			if (!latest) error = `Branch ${branch} not found on ${remote}`;
		} catch (e) {
			error = `git ls-remote failed: ${(e as Error).message}`;
		}
		for (const item of items) {
			results.push(
				latest
					? {
							...item,
							latest,
							status: latest === head ? "up-to-date" : "outdated",
						}
					: { ...item, status: "error", error },
			);
		}
	}

	results.sort((a, b) =>
		(a.skill + a.copy + a.via).localeCompare(b.skill + b.copy + b.via),
	);
	return {
		checkedAt: (deps.now ?? (() => new Date()))().toISOString(),
		requests,
		results,
	};
}

export interface UpstreamTally {
	/** Distinct skills per status. */
	skills: Record<UpstreamStatus, number>;
	/** Outdated skill names, each once, in report order. */
	outdated: string[];
	/** Distinct error messages. */
	errors: string[];
	/** Results (copy × source) that errored. */
	errorResults: number;
}

/** Counts for reporting a check, shared by the CLI and the UI. */
export function tallyUpstream(report: UpstreamReport): UpstreamTally {
	const skillsWith = (status: UpstreamStatus) =>
		new Set(
			report.results.filter((r) => r.status === status).map((r) => r.skill),
		);
	return {
		skills: {
			"up-to-date": skillsWith("up-to-date").size,
			outdated: skillsWith("outdated").size,
			"missing-upstream": skillsWith("missing-upstream").size,
			error: skillsWith("error").size,
		},
		outdated: [...skillsWith("outdated")],
		errors: [
			...new Set(report.results.flatMap((r) => (r.error ? [r.error] : []))),
		],
		errorResults: report.results.filter((r) => r.status === "error").length,
	};
}

/** Network access for a check; injectable so tests never hit the network. */
export type UpstreamDeps = Omit<CheckDeps, "homeDir">;

/** The real network: fetch, the installed git, and a token from GITHUB_TOKEN or gh. */
export function defaultUpstreamDeps(tokenFromEnv?: string): UpstreamDeps {
	return { fetch, token: githubToken(tokenFromEnv), lsRemote: gitLsRemote };
}

/** `git ls-remote` via the installed git. */
export function gitLsRemote(remote: string, ref: string): string | undefined {
	const proc = Bun.spawnSync(["git", "ls-remote", remote, ref], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (proc.exitCode !== 0)
		throw new Error(proc.stderr.toString().trim() || `exit ${proc.exitCode}`);
	return proc.stdout.toString().split(/\s+/)[0] || undefined;
}

/** The given token (GITHUB_TOKEN), else `gh auth token` if gh is installed and logged in. */
export function githubToken(fromEnv?: string): string | undefined {
	if (fromEnv) return fromEnv;
	try {
		const proc = Bun.spawnSync(["gh", "auth", "token"], {
			stdout: "pipe",
			stderr: "ignore",
		});
		return proc.exitCode === 0
			? proc.stdout.toString().trim() || undefined
			: undefined;
	} catch {
		return undefined;
	}
}
