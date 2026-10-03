import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { listSkillFiles } from "../indexer/files.ts";
import type { SkillRecord } from "../inventory/format.ts";
import { fromPortable } from "../paths.ts";

/** File-level comparison of two copies of one skill, with unified diffs for changed text files. */
export function copyDiff(
	skill: SkillRecord | undefined,
	a: number,
	b: number,
	homeDir: string,
): CopyDiff | undefined {
	const left = skill?.copies[a];
	const right = skill?.copies[b];
	if (!left || !right) return undefined;
	const leftDir = fromPortable(left.realPath, homeDir);
	const rightDir = fromPortable(right.realPath, homeDir);
	const files = new Set([...listFiles(leftDir), ...listFiles(rightDir)]);
	const out: FileDiff[] = [];
	for (const rel of [...files].sort()) {
		const l = readText(path.join(leftDir, rel));
		const r = readText(path.join(rightDir, rel));
		if (l === r) continue;
		const status =
			l === undefined
				? "only-right"
				: r === undefined
					? "only-left"
					: "changed";
		const patch =
			status === "changed" && typeof l === "string" && typeof r === "string"
				? createTwoFilesPatch(left.realPath, right.realPath, l, r, "", "", {
						context: 3,
					})
				: undefined;
		out.push({ path: rel, status, patch, binary: l === null || r === null });
	}
	return { left: left.realPath, right: right.realPath, files: out };
}

export interface FileDiff {
	path: string;
	status: "changed" | "only-left" | "only-right";
	patch?: string;
	binary: boolean;
}

export interface CopyDiff {
	left: string;
	right: string;
	files: FileDiff[];
}

export interface CopyFiles {
	realPath: string;
	files: { path: string; bytes: number }[];
}

/** The files in one copy, as the content hash sees them. */
export function copyFiles(
	skill: SkillRecord | undefined,
	copy: number,
	homeDir: string,
): CopyFiles | undefined {
	const c = skill?.copies[copy];
	if (!c) return undefined;
	const dir = fromPortable(c.realPath, homeDir);
	return {
		realPath: c.realPath,
		files: listFiles(dir).map((rel) => ({
			path: rel,
			bytes:
				statSync(path.join(dir, rel), { throwIfNoEntry: false })?.size ?? 0,
		})),
	};
}

export interface FileText {
	path: string;
	bytes: number;
	/** null when the file is binary or too large to show. */
	text: string | null;
}

/**
 * One file of one copy. Only paths the file listing returns are served, so a
 * crafted `path` can't read outside the skill folder.
 */
export function copyFile(
	skill: SkillRecord | undefined,
	copy: number,
	rel: string,
	homeDir: string,
): FileText | undefined {
	const c = skill?.copies[copy];
	if (!c) return undefined;
	const dir = fromPortable(c.realPath, homeDir);
	if (!listFiles(dir).includes(rel)) return undefined;
	const file = path.join(dir, rel);
	const text = readText(file);
	if (text === undefined) return undefined;
	return { path: rel, bytes: statSync(file).size, text };
}

const MAX_TEXT = 256 * 1024;

/** undefined = missing, null = binary or too large to show. */
function readText(file: string): string | null | undefined {
	if (!existsSync(file)) return undefined;
	if (statSync(file).size > MAX_TEXT) return null;
	const buf = readFileSync(file);
	return buf.includes(0) ? null : buf.toString("utf8");
}

/** A copy that can't be read diffs as empty. */
function listFiles(root: string): string[] {
	try {
		return listSkillFiles(root);
	} catch {
		return [];
	}
}
