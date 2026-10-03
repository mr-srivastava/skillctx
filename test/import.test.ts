import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli/index.ts";
import { readLockfile } from "../src/core/library/store.ts";
import { resolveWorkspace, type Env } from "../src/core/workspace.ts";

let tmp: string;
let env: Env;
let out: string[];
let err: string[];
const io = {
	out: (l: string) => out.push(l),
	err: (l: string) => err.push(l),
};
const run = async (...argv: string[]) => {
	out = [];
	err = [];
	return main(argv, io, env);
};
const at = (rel: string) => path.join(env.homeDir, rel);
const dbFile = () => at(".skills-manager/skills-manager.db");

function skill(dir: string, name: string) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${name} skill\n---\nBody.\n`,
	);
}

/** Skills Manager holds react and gone (whose folder was deleted); react has a preset and tags. */
function skillsManager() {
	skill(at(".skills-manager/skills/react"), "react");
	const db = new Database(dbFile());
	db.run(
		"CREATE TABLE skills (id TEXT, name TEXT, central_path TEXT, source_type TEXT, source_ref TEXT, source_revision TEXT, remote_revision TEXT, update_status TEXT)",
	);
	db.run("CREATE TABLE scenarios (id TEXT, name TEXT)");
	db.run("CREATE TABLE scenario_skills (scenario_id TEXT, skill_id TEXT)");
	db.run("CREATE TABLE skill_tags (skill_id TEXT, tag TEXT)");
	const add = db.prepare(
		"INSERT INTO skills (id, name, central_path, source_type) VALUES (?, ?, ?, 'import')",
	);
	add.run("1", "react", at(".skills-manager/skills/react"));
	add.run("2", "gone", at(".skills-manager/skills/gone"));
	db.run("INSERT INTO scenarios VALUES ('p', 'web')");
	db.run("INSERT INTO scenario_skills VALUES ('p', '1')");
	db.run("INSERT INTO skill_tags VALUES ('1', 'ui'), ('1', 'frontend')");
	db.close();
}

beforeEach(async () => {
	tmp = mkdtempSync(path.join(os.tmpdir(), "skillctx-import-"));
	env = {
		homeDir: path.join(tmp, "home"),
		configDir: path.join(tmp, "home/.config/skillctx"),
	};
	mkdirSync(env.homeDir, { recursive: true });
	await run("init", "--home", "~/sk");
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("import skills-manager", () => {
	test("adopts its skills and keeps presets and tags; Skills Manager is unchanged", async () => {
		skillsManager();
		await run("inventory");
		const before = readFileSync(dbFile());
		expect(await run("import", "skills-manager")).toBe(0);
		expect(out[0]).toBe(
			"Adopted 1 skills from Skills Manager; 0 already in the library; 1 skipped.",
		);
		expect(err[0]).toContain("skipped gone");
		const entry = readLockfile(resolveWorkspace(env)).skills.react;
		expect(entry).toMatchObject({
			adoptedFrom: "~/.skills-manager/skills/react",
			skillsManager: { presets: ["web"], tags: ["frontend", "ui"] },
		});
		expect(readFileSync(dbFile())).toEqual(before);
		expect(existsSync(at(".skills-manager/skills/react/SKILL.md"))).toBe(true);
	});

	test("--dry-run writes nothing; a second import changes nothing", async () => {
		skillsManager();
		await run("inventory");
		expect(await run("import", "skills-manager", "--dry-run")).toBe(0);
		expect(out[0]).toStartWith("Would adopt 1 skills");
		expect(existsSync(at("sk/library/lock.json"))).toBe(false);
		await run("import", "skills-manager");
		expect(await run("import", "skills-manager")).toBe(0);
		expect(out[0]).toContain("0 skills from Skills Manager; 1 already");
	});

	test("no Skills Manager library exits 1", async () => {
		expect(await run("import", "skills-manager")).toBe(1);
		expect(err[0]).toContain("No Skills Manager library");
		expect(await run("import", "other")).toBe(2);
	});
});
