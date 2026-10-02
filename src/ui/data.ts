import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { listSkillFiles } from "../core/indexer/files.ts";
import type { SkillRecord } from "../core/inventory/format.ts";
import { fromPortable } from "../core/paths.ts";

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
