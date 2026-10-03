import type { UpstreamReport } from "../upstream/index.ts";
import { parseVersioned, serializeVersioned } from "../versioned.ts";
import { type Workspace, WorkspaceError } from "../workspace.ts";
import {
	INVENTORY_FORMAT,
	type InventorySummary,
	LAST_SCAN_FILE,
	SKILLS_DIR,
	type SkillRecord,
	SUMMARY_FILE,
	skillFileName,
	toRecord,
	UPSTREAM_FILE,
} from "./format.ts";
import type { ScanResult } from "./scan.ts";

/** The inventory on disk was written by a newer skillctx than this one. */
export class InventoryFormatError extends WorkspaceError {
	override name = "InventoryFormatError";
}

function tooNew(rel: string, format: number): InventoryFormatError {
	return new InventoryFormatError(
		`${rel} uses inventory format ${format}, but this skillctx reads up to ${INVENTORY_FORMAT}. Upgrade skillctx`,
	);
}

/** Serialize with `format` as the first key. */
function serialize(value: object): string {
	return serializeVersioned(INVENTORY_FORMAT, value);
}

/**
 * Parse an inventory file and drop its `format` key. A missing or unreadable
 * file is undefined. A newer format throws rather than being misread.
 */
function parse<T>(ws: Workspace, rel: string): T | undefined {
	const parsed = parseVersioned(ws.read(rel));
	if (!parsed) return undefined;
	if (parsed.format > INVENTORY_FORMAT) throw tooNew(rel, parsed.format);
	return parsed.value as T;
}

/** Refuse to overwrite an inventory a newer skillctx wrote. */
function assertWritable(ws: Workspace): void {
	parse(ws, SUMMARY_FILE);
}

export interface WriteResult {
	written: number;
	unchanged: number;
	removed: number;
}

/** Write one file per skill plus a summary. Files for vanished skills are removed. */
export function writeInventory(
	ws: Workspace,
	result: ScanResult,
	homeDir: string,
): WriteResult {
	assertWritable(ws);
	const out: WriteResult = { written: 0, unchanged: 0, removed: 0 };
	const keep = new Set<string>();

	for (const skill of result.skills) {
		let file = skillFileName(skill.name);
		if (keep.has(file))
			file = file.replace(
				/\.json$/,
				`-${skill.copies[0]?.hash.slice(3, 11)}.json`,
			);
		keep.add(file);
		if (ws.write(`${SKILLS_DIR}/${file}`, serialize(toRecord(skill, homeDir))))
			out.written++;
		else out.unchanged++;
	}
	for (const file of ws.list(SKILLS_DIR)) {
		if (
			file.endsWith(".json") &&
			!keep.has(file) &&
			ws.remove(`${SKILLS_DIR}/${file}`)
		)
			out.removed++;
	}

	ws.write(SUMMARY_FILE, serialize(result.summary));
	ws.write(
		LAST_SCAN_FILE,
		`${JSON.stringify({ scannedAt: new Date().toISOString() }, null, 2)}\n`,
	);
	return out;
}

export function writeUpstream(ws: Workspace, report: UpstreamReport): void {
	assertWritable(ws);
	ws.write(UPSTREAM_FILE, serialize(report));
}

/**
 * Reads the inventory a scan wrote. Each call reads the files afresh, so a
 * long-running reader (the UI server) sees the latest scan. Throws
 * InventoryFormatError for files from a newer skillctx.
 */
export class InventoryReader {
	constructor(private readonly ws: Workspace) {}

	summary(): InventorySummary | undefined {
		return parse<InventorySummary>(this.ws, SUMMARY_FILE);
	}

	upstream(): UpstreamReport | undefined {
		return parse<UpstreamReport>(this.ws, UPSTREAM_FILE);
	}

	skills(): SkillRecord[] {
		return this.ws
			.list(SKILLS_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => parse<SkillRecord>(this.ws, `${SKILLS_DIR}/${f}`))
			.filter((r): r is SkillRecord => r !== undefined)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	skill(name: string): SkillRecord | undefined {
		return this.skills().find((s) => s.name === name);
	}
}
