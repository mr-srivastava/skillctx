import { Database } from "bun:sqlite";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { InventoryReader } from "../inventory/store.ts";
import { withWorkspaceLock } from "../lock.ts";
import { fromPortable } from "../paths.ts";
import type { Workspace } from "../workspace.ts";
import { AdoptError, adopt } from "./adopt.ts";
import { putLockEntry, readLockfile } from "./store.ts";

/** One skill in Skills Manager's library, with its presets and tags. */
export interface ManagedBySkillsManager {
	name: string;
	/** Real path of its folder; undefined when the folder no longer exists. */
	realPath: string | undefined;
	presets: string[];
	tags: string[];
}

const DB = ".skills-manager/skills-manager.db";

function real(p: string): string | undefined {
	try {
		return realpathSync(p);
	} catch {
		return undefined;
	}
}

function tableExists(db: Database, name: string): boolean {
	return (
		db
			.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
			.get(name) !== null
	);
}

/**
 * Read Skills Manager's library from its SQLite database, read-only.
 * Presets are its `scenarios`; both they and tags are optional tables, since
 * older versions lack them. Undefined when there is no database.
 */
export function readSkillsManager(
	homeDir: string,
): ManagedBySkillsManager[] | undefined {
	const file = path.join(homeDir, DB);
	if (!existsSync(file)) return undefined;
	const db = new Database(file, { readonly: true });
	try {
		const rows = db
			.query("SELECT id, name, central_path FROM skills ORDER BY name")
			.all() as { id: string; name: string; central_path: string }[];
		const presets = new Map<string, string[]>();
		if (tableExists(db, "scenarios") && tableExists(db, "scenario_skills")) {
			for (const r of db
				.query(
					"SELECT ss.skill_id AS id, s.name AS preset FROM scenario_skills ss JOIN scenarios s ON s.id = ss.scenario_id ORDER BY s.name",
				)
				.all() as { id: string; preset: string }[]) {
				presets.set(r.id, [...(presets.get(r.id) ?? []), r.preset]);
			}
		}
		const tags = new Map<string, string[]>();
		if (tableExists(db, "skill_tags")) {
			for (const r of db
				.query("SELECT skill_id AS id, tag FROM skill_tags ORDER BY tag")
				.all() as { id: string; tag: string }[]) {
				tags.set(r.id, [...(tags.get(r.id) ?? []), r.tag]);
			}
		}
		const out: ManagedBySkillsManager[] = [];
		for (const row of rows) {
			out.push({
				name: row.name,
				realPath: real(row.central_path),
				presets: presets.get(row.id) ?? [],
				tags: tags.get(row.id) ?? [],
			});
		}
		return out;
	} finally {
		db.close();
	}
}

export interface ImportOutcome {
	/** Skills Manager's name for it. */
	name: string;
	/** The inventory name it was adopted under, when found. */
	skill?: string;
	status: "adopted" | "unchanged" | "skipped";
	reason?: string;
}

/**
 * Adopt every skill in Skills Manager's library and keep its presets and
 * tags in the lockfile for Phase 3 (ADR-021). Uses the last inventory scan to
 * find each folder. Never writes to ~/.skills-manager. With `dryRun`, reports
 * what would happen and writes nothing.
 */
export function importSkillsManager(
	ws: Workspace,
	homeDir: string,
	opts: { now: string; dryRun: boolean },
): ImportOutcome[] | undefined {
	const run = () => importLocked(ws, homeDir, opts);
	return opts.dryRun ? run() : withWorkspaceLock(ws, run);
}

function importLocked(
	ws: Workspace,
	homeDir: string,
	opts: { now: string; dryRun: boolean },
): ImportOutcome[] | undefined {
	const library = readSkillsManager(homeDir);
	if (!library) return undefined;
	const records = new InventoryReader(ws).skills();
	const outcomes: ImportOutcome[] = [];
	for (const sm of library) {
		if (!sm.realPath) {
			outcomes.push({
				name: sm.name,
				status: "skipped",
				reason: "its folder no longer exists",
			});
			continue;
		}
		// Inventory paths are ~/ paths; compare real paths, since home itself
		// may sit behind a symlink.
		let found: { skill: string; copy: number } | undefined;
		for (const r of records) {
			const i = r.copies.findIndex(
				(c) => real(fromPortable(c.realPath, homeDir)) === sm.realPath,
			);
			if (i >= 0) found = { skill: r.name, copy: i };
		}
		if (!found) {
			outcomes.push({
				name: sm.name,
				status: "skipped",
				reason: "not in the inventory; run `skillctx inventory` first",
			});
			continue;
		}
		const existing = readLockfile(ws).skills[found.skill];
		if (opts.dryRun) {
			outcomes.push({
				name: sm.name,
				skill: found.skill,
				status: existing ? "unchanged" : "adopted",
			});
			continue;
		}
		try {
			const result = adopt(ws, homeDir, {
				name: found.skill,
				copy: found.copy,
				now: opts.now,
			});
			putLockEntry(ws, found.skill, {
				...result.entry,
				skillsManager: { presets: sm.presets, tags: sm.tags },
			});
			outcomes.push({
				name: sm.name,
				skill: found.skill,
				status: result.status,
			});
		} catch (error) {
			if (!(error instanceof AdoptError)) throw error;
			outcomes.push({
				name: sm.name,
				skill: found.skill,
				status: "skipped",
				reason: error.message,
			});
		}
	}
	return outcomes;
}
