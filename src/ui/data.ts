import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import {
	type InventorySummary,
	SKILLS_DIR,
	SUMMARY_FILE,
	type toRecord,
	UPSTREAM_FILE,
} from "../core/inventory.ts";
import { fromPortable } from "../core/paths.ts";
import type { UpstreamReport } from "../core/upstream/index.ts";
import type { Workspace } from "../core/workspace.ts";

export type SkillRecord = ReturnType<typeof toRecord>;

/** Reads the inventory files a scan wrote. The UI never scans on its own except via refresh. */
export class InventoryStore {
	constructor(
		private readonly ws: Workspace,
		private readonly homeDir: string,
	) {}

	summary(): InventorySummary | undefined {
		return this.readJson<InventorySummary>(SUMMARY_FILE);
	}

	upstream(): UpstreamReport | undefined {
		return this.readJson<UpstreamReport>(UPSTREAM_FILE);
	}

	skills(): SkillRecord[] {
		return this.ws
			.list(SKILLS_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => this.readJson<SkillRecord>(`${SKILLS_DIR}/${f}`))
			.filter((r): r is SkillRecord => r !== undefined)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	skill(name: string): SkillRecord | undefined {
		return this.skills().find((s) => s.name === name);
	}

	/** File-level comparison of two copies of one skill, with unified diffs for changed text files. */
	diff(name: string, a: number, b: number): CopyDiff | undefined {
		const skill = this.skill(name);
		const left = skill?.copies[a];
		const right = skill?.copies[b];
		if (!left || !right) return undefined;
		const leftDir = fromPortable(left.realPath, this.homeDir);
		const rightDir = fromPortable(right.realPath, this.homeDir);
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

	private readJson<T>(rel: string): T | undefined {
		try {
			return JSON.parse(readFileSync(this.ws.resolve(rel), "utf8")) as T;
		} catch {
			return undefined;
		}
	}
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

function listFiles(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string, prefix: string) => {
		let names: string[];
		try {
			names = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of names) {
			if (name === ".git" || name === ".DS_Store" || name === "node_modules")
				continue;
			const full = path.join(dir, name);
			const rel = prefix ? `${prefix}/${name}` : name;
			const stat = statSync(full, { throwIfNoEntry: false });
			if (stat?.isDirectory()) walk(full, rel);
			else if (stat?.isFile()) out.push(rel);
		}
	};
	walk(root, "");
	return out;
}
