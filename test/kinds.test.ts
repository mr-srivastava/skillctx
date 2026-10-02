import { describe, expect, test } from "bun:test";
import {
	installedTree,
	provenanceDetails,
	sourceLabel,
	updateCommand,
	upstreamTarget,
} from "../src/core/provenance/kinds.ts";
import type { Provenance } from "../src/core/provenance/types.ts";
import { rootLabel } from "../src/core/sources/roots.ts";

const lock: Provenance = {
	kind: "skill-lock",
	source: "o/skills",
	sourceType: "github",
	sourceUrl: "https://github.com/o/skills.git",
	skillPath: "skills/a/SKILL.md",
	folderHash: "abc",
	pinnedRef: "v2",
};

const checkout: Provenance = {
	kind: "git-checkout",
	repoRoot: "~/src/r",
	remote: "https://github.com/o/r.git",
	branch: "main",
	head: "0123456789abcdef",
};

describe("provenance kinds", () => {
	test("labels cover every kind plus untracked; unknown kinds pass through", () => {
		expect(sourceLabel("skill-lock")).toBe("npx skills / gh skill");
		expect(sourceLabel("untracked")).toBe("Untracked");
		expect(sourceLabel("someday")).toBe("someday");
		expect(sourceLabel("toString")).toBe("toString");
	});

	test("only sources that record a tree SHA report one", () => {
		expect(installedTree(lock)).toBe("abc");
		expect(installedTree(checkout)).toBeUndefined();
		expect(installedTree({ kind: "claude-app-synced" })).toBeUndefined();
	});

	test("upstream targets carry ref defaults and skip what can't be checked", () => {
		expect(upstreamTarget(lock)).toEqual({
			type: "github-tree",
			repo: "https://github.com/o/skills.git",
			path: "skills/a/SKILL.md",
			ref: "v2",
			installed: "abc",
		});
		expect(
			upstreamTarget({ kind: "gh-frontmatter", repo: "o/gh", path: "s" }),
		).toBeUndefined();
		expect(upstreamTarget({ ...checkout, branch: "HEAD" })).toBeUndefined();
		expect(upstreamTarget(checkout)?.type).toBe("git-branch");
	});

	test("update commands are per source; a git checkout pulls its repo root", () => {
		expect(updateCommand("gh-frontmatter", "a", "~/x")).toBe(
			"gh skill update a",
		);
		expect(
			updateCommand("git-checkout", "a", "~/src/r/plugins/p/skills/a"),
		).toBe("git -C ~/src/r/plugins/p pull");
		expect(updateCommand("claude-plugin", "a", "~/x")).toBeUndefined();
	});

	test("details render as text runs", () => {
		expect(provenanceDetails(checkout)).toEqual([
			{ text: "https://github.com/o/r.git", as: "path" },
			{ text: ", branch main, commit ", as: "soft" },
			{ text: "01234567", as: "path" },
		]);
	});
});

describe("root labels", () => {
	test("built-in, plugin and custom roots get short names", () => {
		expect(rootLabel("claude-code")).toBe("Claude");
		expect(rootLabel("claude-plugin:paper@p")).toBe("paper");
		expect(rootLabel("custom:~/src/understand/skills")).toBe("skills");
		expect(rootLabel("mystery")).toBe("mystery");
	});
});
