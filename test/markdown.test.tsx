import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	Markdown,
	parseMarkdown,
	resolveLink,
	splitFrontmatter,
} from "../src/ui/client/markdown.tsx";

function render(md: string, files: string[] = [], file = "SKILL.md"): string {
	return renderToStaticMarkup(
		<Markdown
			parsed={parseMarkdown(md)}
			file={file}
			files={new Set(files)}
			onOpenFile={() => {}}
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
