/**
 * Where one copy of a skill came from, as recorded by the tool that put it
 * there. A copy can carry several (e.g. a lockfile entry and gh frontmatter).
 * Paths are absolute here; the inventory writer makes them portable.
 */
export type Provenance =
	| {
			kind: "skill-lock";
			/** Written by `npx skills` and `gh skill` (shared ~/.agents/.skill-lock.json). */
			source: string;
			sourceType: string;
			sourceUrl: string;
			skillPath?: string;
			/** Git tree SHA of the skill folder at install time. */
			folderHash: string;
			pinnedRef?: string;
			installedAt?: string;
			updatedAt?: string;
	  }
	| {
			kind: "gh-frontmatter";
			repo: string;
			ref?: string;
			treeSha?: string;
			path?: string;
			pinned?: string;
	  }
	| {
			kind: "git-checkout";
			repoRoot: string;
			remote?: string;
			branch?: string;
			head: string;
	  }
	| {
			kind: "skills-manager";
			sourceType: string;
			sourceRef?: string;
			sourceRevision?: string;
			remoteRevision?: string;
			updateStatus?: string;
	  }
	| {
			kind: "claude-plugin";
			plugin: string;
			version?: string;
			gitCommitSha?: string;
	  }
	| { kind: "claude-app-synced" }
	| {
			kind: "skillctx";
			/** The managed skill this copy is a deployment of. */
			skill: string;
			mode: "symlink" | "copy";
	  };

export type ProvenanceKind = Provenance["kind"];
