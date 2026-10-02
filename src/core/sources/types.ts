/** One skill folder as seen through one skill root. */
export interface SkillEntry {
	/** Id of the root it was found in, e.g. "agents", "claude-code". */
	rootId: string;
	/** Absolute path of the root folder. */
	rootPath: string;
	/** Absolute path of the skill folder as listed in the root (may be a symlink). */
	entryPath: string;
	/** Absolute path after resolving symlinks. Same realPath = same instance. */
	realPath: string;
	/** True when entryPath (or a parent inside the root) is a symlink. */
	viaSymlink: boolean;
}

/** A known place where skills live. */
export interface SkillRoot {
	id: string;
	label: string;
	/** Column-width name for tables; defaults to a name derived from the id. */
	short?: string;
	/** `~/` path or absolute path. */
	path: string;
}
