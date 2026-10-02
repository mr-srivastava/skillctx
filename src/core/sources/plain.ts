import {
	existsSync,
	lstatSync,
	readdirSync,
	realpathSync,
	statSync,
} from "node:fs";
import path from "node:path";
import { fromPortable } from "../paths.ts";
import type { SkillEntry, SkillRoot } from "./types.ts";

/** Grouping folders can nest skills; deeper than this is treated as noise. */
const MAX_DEPTH = 3;

/** Dot-folders cover .git, .trash, .cowork-export and Skills Manager's .skills-manager. */
function skipName(name: string): boolean {
	return name.startsWith(".") || name === "node_modules";
}

function isDir(p: string): boolean {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false; // broken symlink or unreadable
	}
}

/**
 * List every folder containing a SKILL.md under the given roots, following
 * symlinks. Missing roots are skipped. Symlink loops terminate because each
 * real directory is visited once per root.
 */
export function listPlainSkills(
	roots: readonly SkillRoot[],
	homeDir: string,
): SkillEntry[] {
	const entries: SkillEntry[] = [];

	for (const root of roots) {
		const rootPath = fromPortable(root.path, homeDir);
		if (!isDir(rootPath)) continue;
		const visited = new Set<string>();

		const walk = (dir: string, depth: number, viaSymlink: boolean) => {
			let real: string;
			try {
				real = realpathSync(dir);
			} catch {
				return;
			}
			// A skill folder is recorded even if another entry already points at it
			// (two names, one real folder); only descent into grouping folders is
			// deduplicated, which is what stops symlink loops.
			if (dir !== rootPath && existsSync(path.join(dir, "SKILL.md"))) {
				entries.push({
					rootId: root.id,
					rootPath,
					entryPath: dir,
					realPath: real,
					viaSymlink,
				});
				return;
			}
			if (visited.has(real) || depth >= MAX_DEPTH) return;
			visited.add(real);

			let names: string[];
			try {
				names = readdirSync(dir);
			} catch {
				return;
			}
			for (const name of names.sort()) {
				if (skipName(name)) continue;
				const child = path.join(dir, name);
				if (!isDir(child)) continue;
				const childIsLink = lstatSync(child).isSymbolicLink();
				walk(child, depth + 1, viaSymlink || childIsLink);
			}
		};

		walk(rootPath, 0, false);
	}
	return entries;
}
