import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { listSkillFiles } from "./files.ts";
import { canonicalSkillMd } from "./parse.ts";

/**
 * Hash scheme version. Bump when normalization changes, since stored hashes
 * from an older scheme can no longer be compared.
 */
export const HASH_SCHEME = "h2";

/**
 * Frontmatter keys (dotted paths) that record where a copy came from rather
 * than what it says. Stripped before hashing so the same skill installed by
 * two tools hashes the same. `gh skill` injects these under `metadata`
 * (cli/cli internal/skills/frontmatter/frontmatter.go).
 */
export const PROVENANCE_KEYS: ReadonlySet<string> = new Set([
	"metadata.github-repo",
	"metadata.github-ref",
	"metadata.github-tree-sha",
	"metadata.github-path",
	"metadata.github-pinned",
	"metadata.github-sha",
	"metadata.github-owner",
	"metadata.local-path",
]);

export interface FolderDigest {
	hash: string;
	fileCount: number;
	bytes: number;
}

/** Content hash of a skill folder: sorted relative paths plus bytes, provenance keys stripped. */
export function hashFolder(
	folder: string,
	provenanceKeys = PROVENANCE_KEYS,
): FolderDigest {
	const hash = createHash("sha256");
	let bytes = 0;
	const files = listSkillFiles(folder);
	for (const rel of files) {
		let content: Buffer = readFileSync(path.join(folder, rel));
		if (rel === "SKILL.md") {
			content = Buffer.from(
				canonicalSkillMd(content.toString("utf8"), provenanceKeys),
			);
		}
		bytes += content.length;
		hash.update(rel);
		hash.update("\0");
		hash.update(String(content.length));
		hash.update("\0");
		hash.update(content);
	}
	return {
		hash: `${HASH_SCHEME}:${hash.digest("hex")}`,
		fileCount: files.length,
		bytes,
	};
}
