import { describe, expect, test } from "bun:test";
import type { AgentId } from "../src/core/deploy/agents.ts";
import { type FolderView, plan } from "../src/core/deploy/plan.ts";
import type { Deployment, EntryState } from "../src/core/deploy/record.ts";

const PATHS: Record<string, string> = {
	agents: "/h/.agents/skills",
	"claude-code": "/h/.claude/skills",
	codex: "/h/.codex/skills",
	cursor: "/h/.cursor/skills",
	gemini: "/h/.gemini/skills",
	opencode: "/h/.config/opencode/skills",
};

function rec(id: string, extra: Partial<Deployment> = {}): Deployment {
	return {
		skill: "tdd",
		folder: PATHS[id] ?? id,
		entry: `${PATHS[id]}/tdd`,
		mode: "symlink",
		hash: "h2:x",
		deployedAt: "t",
		...extra,
	};
}

/** Every folder free unless overridden. */
function folders(
	states: Partial<Record<string, EntryState>> = {},
	recorded: Partial<Record<string, Deployment>> = {},
): FolderView[] {
	return Object.entries(PATHS).map(([id, p]) => ({
		id,
		path: p,
		state: states[id] ?? "missing",
		recorded: recorded[id],
	}));
}

const run = (
	agents: AgentId[],
	f: FolderView[],
	mode: "symlink" | "copy" = "symlink",
) => plan({ skill: "tdd", hash: "h2:x", agents, mode, folders: f });

const kinds = (p: ReturnType<typeof plan>) =>
	p.ops.map((o) => `${o.kind} ${o.entry}`);

describe("folder choice", () => {
	test("one agent, free folders: its own folder", () => {
		expect(kinds(run(["claude"], folders()))).toEqual([
			"create /h/.claude/skills/tdd",
		]);
	});

	test("codex, gemini and cursor share ~/.agents/skills when it's free", () => {
		const p = run(["codex", "gemini", "cursor"], folders());
		expect(kinds(p)).toEqual(["create /h/.agents/skills/tdd"]);
		expect(p.warnings).toEqual([]);
	});

	test("claude alone exposes the skill to cursor, and says so", () => {
		const p = run(["claude"], folders());
		expect(p.warnings).toEqual([
			"Also visible to Cursor, which read the same folder.",
		]);
	});

	test("prefers a folder that is already ours", () => {
		const p = run(
			["codex"],
			folders({ codex: "ours" }, { codex: rec("codex") }),
		);
		expect(kinds(p)).toEqual(["keep /h/.codex/skills/tdd"]);
	});
});

describe("the author's machine: npx skills owns ~/.agents/skills", () => {
	// Real folders in ~/.agents/skills; symlinks into it everywhere else.
	const npx = folders({
		agents: "foreign-folder",
		"claude-code": "foreign-link",
		codex: "foreign-link",
		cursor: "foreign-link",
		gemini: "foreign-link",
		opencode: "foreign-link",
	});

	test("claude: take over its link, after confirmation", () => {
		const p = run(["claude"], npx);
		expect(kinds(p)).toEqual(["takeover /h/.claude/skills/tdd"]);
		expect(p.needsConfirmation).toBe(true);
		expect(p.warnings).toContain(
			"Cursor will see tdd 4 times: /h/.cursor/skills, /h/.agents/skills, /h/.claude/skills, /h/.codex/skills",
		);
	});

	test("codex goes through ~/.codex/skills and warns it sees two copies", () => {
		const p = run(["codex"], npx);
		expect(kinds(p)).toEqual(["takeover /h/.codex/skills/tdd"]);
		expect(p.warnings[0]).toBe(
			"Codex will see tdd 2 times: /h/.agents/skills, /h/.codex/skills",
		);
	});

	test("an agent whose only folder is another tool's real folder is blocked", () => {
		const p = run(["opencode"], folders({ opencode: "foreign-folder" }));
		expect(p.ops).toEqual([]);
		expect(p.blocked).toEqual([
			{
				agent: "opencode",
				reasons: [
					"/h/.config/opencode/skills: another tool's folder (never replaced)",
				],
			},
		]);
	});
});

describe("changes and undeploy", () => {
	test("switching mode recreates our entry", () => {
		const p = run(
			["claude"],
			folders({ "claude-code": "ours" }, { "claude-code": rec("claude-code") }),
			"copy",
		);
		expect(kinds(p)).toEqual(["recreate /h/.claude/skills/tdd"]);
	});

	test("an unrecorded link to our build is recorded, not rewritten", () => {
		const p = run(["claude"], folders({ "claude-code": "ours-unrecorded" }));
		expect(kinds(p)).toEqual(["record /h/.claude/skills/tdd"]);
	});

	test("dropping an agent removes our entry and restores the link we replaced", () => {
		const p = run(
			["claude"],
			folders(
				{ "claude-code": "ours", codex: "ours" },
				{
					"claude-code": rec("claude-code"),
					codex: rec("codex", {
						replaced: { linkTarget: "/h/.agents/skills/tdd" },
					}),
				},
			),
		);
		expect(p.ops).toContainEqual({
			kind: "remove",
			folder: "/h/.codex/skills",
			entry: "/h/.codex/skills/tdd",
			restore: "/h/.agents/skills/tdd",
		});
		expect(kinds(p)).toContain("keep /h/.claude/skills/tdd");
	});

	test("undeploy (no agents) removes ours and forgets what was taken back", () => {
		const p = run(
			[],
			folders(
				{ "claude-code": "ours", codex: "taken-back" },
				{ "claude-code": rec("claude-code"), codex: rec("codex") },
			),
		);
		expect(kinds(p)).toEqual([
			"remove /h/.claude/skills/tdd",
			"forget /h/.codex/skills/tdd",
		]);
		expect(p.warnings).toEqual([
			"/h/.codex/skills/tdd: another tool rewrote our entry; dropping it from the record and leaving it alone.",
		]);
	});

	test("a taken-back folder is never chosen again", () => {
		const p = run(
			["codex"],
			folders({ codex: "taken-back" }, { codex: rec("codex") }),
		);
		expect(kinds(p)).toEqual([
			"create /h/.agents/skills/tdd",
			"forget /h/.codex/skills/tdd",
		]);
		expect(p.warnings[0]).toBe(
			"Codex will see tdd 2 times: /h/.agents/skills, /h/.codex/skills",
		);
	});
});
