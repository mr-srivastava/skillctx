import type { Provenance, ProvenanceKind } from "./types.ts";

/*
 * Everything the rest of skillctx knows about a provenance kind, in one
 * table. Scanning, the upstream check, the CLI and the UI ask these functions
 * instead of switching on `kind` and reading per-kind fields. Adding a source
 * means a union member in types.ts, a lookup in sources.ts, and an entry
 * here; the mapped type below fails to compile until the entry exists.
 *
 * Pure and dependency-free: the browser bundle imports it too.
 */

/** Where to look for a newer version of a copy. */
export type UpstreamTarget =
	| {
			type: "github-tree";
			/** Repository URL or `owner/repo`, as the source recorded it. */
			repo: string;
			/** Skill folder (or its SKILL.md) inside the repo. */
			path: string;
			ref: string;
			/** Git tree SHA recorded at install. */
			installed: string;
	  }
	| {
			type: "git-branch";
			repoRoot: string;
			remote: string;
			branch: string;
			/** Commit checked out now. */
			head: string;
	  };

/** One run of display text. "path" is set in monospace, "soft" is secondary. */
export interface Detail {
	text: string;
	as?: "path" | "soft";
}

type Of<K extends ProvenanceKind> = Extract<Provenance, { kind: K }>;

interface KindSpec<P extends Provenance> {
	/** Which tool put the copy there, for people. */
	label: string;
	/** Git tree SHA of the folder at install time, if the source recorded it. */
	installedTree?: (p: P) => string | undefined;
	upstream?: (p: P) => UpstreamTarget | undefined;
	/** Shell command that updates an outdated copy. skillctx never runs it. */
	updateCommand?: (skill: string, copyPath: string) => string;
	/** What the source recorded, as display text. */
	details: (p: P) => Detail[];
}

const KINDS: { [K in ProvenanceKind]: KindSpec<Of<K>> } = {
	"skill-lock": {
		label: "npx skills / gh skill",
		installedTree: (p) => p.folderHash,
		upstream: (p) =>
			p.skillPath === undefined
				? undefined
				: {
						type: "github-tree",
						repo: p.sourceUrl,
						path: p.skillPath,
						ref: p.pinnedRef ?? "HEAD",
						installed: p.folderHash,
					},
		updateCommand: (skill) => `npx skills update ${skill}`,
		details: (p) => [
			{ text: p.source, as: "path" },
			...(p.updatedAt
				? [
						{
							text: `, last updated ${new Date(p.updatedAt).toLocaleDateString()}`,
							as: "soft" as const,
						},
					]
				: []),
		],
	},
	"gh-frontmatter": {
		label: "gh skill",
		installedTree: (p) => p.treeSha,
		upstream: (p) =>
			p.treeSha === undefined || p.path === undefined
				? undefined
				: {
						type: "github-tree",
						repo: p.repo,
						path: p.path,
						ref: p.pinned ?? "HEAD",
						installed: p.treeSha,
					},
		updateCommand: (skill) => `gh skill update ${skill}`,
		details: (p) => [
			{ text: `${p.repo}${p.ref ? `@${p.ref}` : ""}`, as: "path" },
		],
	},
	"git-checkout": {
		label: "Git checkout",
		upstream: (p) =>
			p.remote && p.branch && p.branch !== "HEAD"
				? {
						type: "git-branch",
						repoRoot: p.repoRoot,
						remote: p.remote,
						branch: p.branch,
						head: p.head,
					}
				: undefined,
		updateCommand: (_skill, copyPath) => {
			// copyPath is "<repo>/.../skills/<name>"; the repo root is what the user pulls.
			const i = copyPath.indexOf("/skills/");
			return `git -C ${i > 0 ? copyPath.slice(0, i) : copyPath} pull`;
		},
		details: (p) => [
			{ text: p.remote ?? p.repoRoot, as: "path" },
			{ text: `, branch ${p.branch}, commit `, as: "soft" },
			{ text: p.head.slice(0, 8), as: "path" },
		],
	},
	"skills-manager": {
		label: "Skills Manager",
		details: (p) => [
			{ text: p.sourceType === "import" ? "Imported" : p.sourceType },
			...(p.sourceRef
				? [{ text: " from " }, { text: p.sourceRef, as: "path" as const }]
				: []),
		],
	},
	"claude-plugin": {
		label: "Claude plugin",
		details: (p) => [
			{ text: p.plugin, as: "path" },
			...(p.version
				? [{ text: `, version ${p.version}`, as: "soft" as const }]
				: []),
		],
	},
	"claude-app-synced": {
		label: "Claude app",
		details: () => [{ text: "Synced by the Claude desktop app" }],
	},
	skillctx: {
		label: "skillctx",
		details: (p) => [
			{
				text:
					p.mode === "copy"
						? "Copied in from skillctx's library"
						: "Linked to skillctx's build",
			},
		],
	},
};

/**
 * The spec for one provenance value. TypeScript can't correlate `p.kind` with
 * the table's per-kind function types, so widen once here.
 */
function spec(p: Provenance): KindSpec<Provenance> {
	return KINDS[p.kind] as KindSpec<Provenance>;
}

function isKind(kind: string): kind is ProvenanceKind {
	return Object.hasOwn(KINDS, kind);
}

/** People-facing name of a source; "untracked" and unknown kinds pass through readably. */
export function sourceLabel(kind: string): string {
	if (isKind(kind)) return KINDS[kind].label;
	return kind === "untracked" ? "Untracked" : kind;
}

export function installedTree(p: Provenance): string | undefined {
	return spec(p).installedTree?.(p);
}

export function upstreamTarget(p: Provenance): UpstreamTarget | undefined {
	return spec(p).upstream?.(p);
}

export function updateCommand(
	kind: ProvenanceKind,
	skill: string,
	copyPath: string,
): string | undefined {
	return KINDS[kind].updateCommand?.(skill, copyPath);
}

export function provenanceDetails(p: Provenance): Detail[] {
	return spec(p).details(p);
}
