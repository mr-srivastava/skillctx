import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Never part of a skill's content. */
const IGNORED: ReadonlySet<string> = new Set([
	".git",
	"node_modules",
	".DS_Store",
]);

/**
 * The files that make up a skill folder, as sorted `/`-separated relative
 * paths. Symlinks are followed; broken ones are skipped. The content hash and
 * the copy diff both use this, so two copies that hash the same never show a
 * file-level difference. Throws if `root` can't be read.
 */
export function listSkillFiles(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			if (IGNORED.has(name)) continue;
			const full = path.join(dir, name);
			const stat = statSync(full, { throwIfNoEntry: false });
			if (!stat) continue;
			if (stat.isDirectory()) walk(full);
			else if (stat.isFile()) out.push(full);
		}
	};
	walk(root);
	return out
		.map((f) => path.relative(root, f).split(path.sep).join("/"))
		.sort();
}
