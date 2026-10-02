import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";

/**
 * Git tree SHA-1 of a folder, computed without git. `npx skills` and
 * `gh skill` record this as `skillFolderHash` at install time (verified on
 * the author's machine: 79 of 83 matched `git write-tree`), so comparing it
 * with the current folder tells us whether the copy was edited after install,
 * offline.
 *
 * Matches git for regular files, executables, symlinks and nested folders.
 * Skips `.git` and `.DS_Store`; empty folders contribute nothing, as in git.
 */
export function gitTreeSha(folder: string): string | undefined {
	const entries: {
		name: string;
		sortKey: string;
		mode: string;
		sha: Buffer;
	}[] = [];

	for (const name of readdirSync(folder)) {
		if (name === ".git" || name === ".DS_Store") continue;
		const full = path.join(folder, name);
		const stat = lstatSync(full);
		if (stat.isSymbolicLink()) {
			entries.push({
				name,
				sortKey: name,
				mode: "120000",
				sha: blobSha(Buffer.from(readlinkSync(full))),
			});
		} else if (stat.isDirectory()) {
			const sub = gitTreeSha(full);
			if (sub)
				entries.push({
					name,
					sortKey: `${name}/`,
					mode: "40000",
					sha: Buffer.from(sub, "hex"),
				});
		} else if (stat.isFile()) {
			const mode = stat.mode & 0o111 ? "100755" : "100644";
			entries.push({
				name,
				sortKey: name,
				mode,
				sha: blobSha(readFileSync(full)),
			});
		}
	}
	if (entries.length === 0) return undefined;

	// Git orders tree entries bytewise, comparing folders as if named "name/".
	entries.sort((a, b) =>
		Buffer.compare(Buffer.from(a.sortKey), Buffer.from(b.sortKey)),
	);
	const body = Buffer.concat(
		entries.flatMap((e) => [Buffer.from(`${e.mode} ${e.name}\0`), e.sha]),
	);
	return objectSha("tree", body).toString("hex");
}

function blobSha(content: Buffer): Buffer {
	return objectSha("blob", content);
}

function objectSha(type: string, body: Buffer): Buffer {
	return createHash("sha1")
		.update(`${type} ${body.length}\0`)
		.update(body)
		.digest();
}
