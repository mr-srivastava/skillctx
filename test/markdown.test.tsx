import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	grammarFor,
	grammarForFile,
	type Highlight,
	loadHighlight,
} from "../src/ui/client/lib/highlight.ts";
import {
	Markdown,
	parseMarkdown,
	resolveLink,
	splitFrontmatter,
} from "../src/ui/client/lib/markdown.tsx";

function render(
	md: string,
	files: string[] = [],
	file = "SKILL.md",
	highlight: Highlight | null = null,
): string {
	return renderToStaticMarkup(
		<Markdown
			parsed={parseMarkdown(md)}
			file={file}
			files={new Set(files)}
			onOpenFile={() => {}}
			highlight={highlight}
		/>,
	);
}

describe("skill markdown", () => {
	test("headings get unique ids that match the outline", () => {
		const { headings } = parseMarkdown(
			"# Title\n\n## Use it\n\n## Use it\n\n### Step `one`!\n",
		);
		expect(headings).toEqual([
			{ id: "md-title", depth: 1, text: "Title" },
			{ id: "md-use-it", depth: 2, text: "Use it" },
			{ id: "md-use-it-1", depth: 2, text: "Use it" },
			{ id: "md-step-one", depth: 3, text: "Step one!" },
		]);
		expect(render("## Use it\n")).toContain('id="md-use-it"');
	});

	test("raw HTML, scripts and unsafe links don't survive", () => {
		const html = render(
			'<script>alert(1)</script>\n\n<b onclick="x()">bold</b>\n\n[bad](javascript:alert(1)) [out](../../etc/passwd)\n',
		);
		expect(html).not.toContain("<script");
		expect(html).not.toContain("onclick");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("passwd");
		expect(html).toContain("bad");
		expect(html).toContain("out");
	});

	test("images are described, never loaded", () => {
		const html = render("![diagram](https://example.com/x.png)\n");
		expect(html).not.toContain("<img");
		expect(html).toContain("Image not loaded: diagram");
	});

	test("links to files in the skill and to the web stay links", () => {
		const html = render(
			"[ref](references/api.md) [web](https://example.com) [missing](nope.md)\n",
			["SKILL.md", "references/api.md"],
		);
		expect(html).toContain('href="references/api.md"');
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('rel="noreferrer noopener"');
		expect(html).not.toContain('href="nope.md"');
	});

	test("GFM tables render", () => {
		expect(render("| a | b |\n| - | - |\n| 1 | 2 |\n")).toContain("<table");
	});

	test("relative links resolve inside the skill only", () => {
		expect(resolveLink("references/a.md", "../SKILL.md")).toBe("SKILL.md");
		expect(resolveLink("references/a.md", "./b.md#x")).toBe("references/b.md");
		expect(resolveLink("SKILL.md", "../x.md")).toBeNull();
		expect(resolveLink("SKILL.md", "/etc/passwd")).toBeNull();
		expect(resolveLink("SKILL.md", "https://x.dev")).toBeNull();
	});

	test("frontmatter splits off the body", () => {
		expect(splitFrontmatter("---\nname: a\n---\n# A\n")).toEqual({
			frontmatter: "name: a",
			body: "# A\n",
		});
		expect(splitFrontmatter("# A\n").frontmatter).toBeNull();
	});
});

describe("code highlighting", () => {
	test("fence names and extensions map to the bundled grammars", () => {
		expect(grammarFor("sh")).toBe("bash");
		expect(grammarFor("TS")).toBe("tsx");
		expect(grammarFor("javascript")).toBe("tsx");
		expect(grammarFor("cobol")).toBeNull();
		expect(grammarFor(undefined)).toBeNull();
		expect(grammarForFile("scripts/run.py")).toBe("python");
		expect(grammarForFile("LICENSE")).toBeNull();
	});

	test("the parse lists the languages its fences name", () => {
		const { languages } = parseMarkdown(
			"```sh\nls\n```\n\n- item\n\n  ```py\n  x = 1\n  ```\n\n```sh\npwd\n```\n\n```\nplain\n```\n",
		);
		expect(languages).toEqual(["sh", "py"]);
	});

	test("fenced code is coloured with palette variables once loaded", async () => {
		const md = '```bash\necho "hi" # greet\n```\n\n```cobol\nDISPLAY.\n```\n';
		expect(render(md)).not.toContain("--code-token");
		const html = render(md, [], "SKILL.md", await loadHighlight(["bash"]));
		expect(html).toContain("var(--code-token-function)");
		expect(html).toContain("var(--code-token-comment)");
		expect(html).toContain('class="line"');
		// No grammar: the block stays as written.
		expect(html).toContain('wrap-break-word">DISPLAY.\n</code>');
		// Shiki's own <pre> and colours don't leak in; ours wraps the lines.
		expect(html).not.toContain("shiki");
	});

	test("a grammar that wasn't loaded leaves code plain", async () => {
		const highlight = await loadHighlight(["yaml"]);
		expect(highlight("x = 1", "toml")).toBeNull();
		expect(highlight("a: 1", "yml")).not.toBeNull();
	});
});
