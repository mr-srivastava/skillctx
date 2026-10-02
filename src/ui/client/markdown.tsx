import type { Element, ElementContent, Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ComponentProps, ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { cn } from "@/lib/utils";

/*
 * Skill files are someone else's text, rendered read-only. The pipeline keeps
 * them inert and local: raw HTML is dropped (remark-rehype's default), images
 * are never fetched (local-first), and a link becomes a link only when it's
 * http(s), mailto, a heading on this page, or another file in the same skill.
 */

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);

export interface Heading {
	/** Element id, prefixed so it can't collide with the app's own ids. */
	id: string;
	depth: number;
	text: string;
}

export interface ParsedMarkdown {
	tree: Root;
	headings: Heading[];
}

/** `---` frontmatter at the top of a file, as in core/indexer/parse.ts. */
const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(text: string): {
	frontmatter: string | null;
	body: string;
} {
	const m = FENCE.exec(text);
	return m
		? { frontmatter: m[1] ?? "", body: text.slice(m[0].length) }
		: { frontmatter: null, body: text };
}

/** GitHub-style heading slug, so a skill's own `#anchor` links still work. */
export function slug(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}\s_-]/gu, "")
		.replace(/\s/g, "-");
}

const ID_PREFIX = "md-";

function textOf(node: ElementContent): string {
	if (node.type === "text") return node.value;
	if (node.type === "element") return node.children.map(textOf).join("");
	return "";
}

/**
 * Parse once, then give every heading an id and list it. The outline and the
 * rendered page come from the same tree, so they can't disagree.
 */
export function parseMarkdown(md: string): ParsedMarkdown {
	const tree = processor.runSync(processor.parse(md));
	const headings: Heading[] = [];
	const seen = new Map<string, number>();
	const visit = (node: Root | Element) => {
		for (const child of node.children) {
			if (child.type !== "element") continue;
			const depth = /^h([1-6])$/.exec(child.tagName)?.[1];
			if (depth) {
				const text = textOf(child).trim();
				const base = slug(text) || "section";
				const n = seen.get(base) ?? 0;
				seen.set(base, n + 1);
				const id = ID_PREFIX + (n === 0 ? base : `${base}-${n}`);
				child.properties.id = id;
				headings.push({ id, depth: Number(depth), text });
			} else {
				visit(child);
			}
		}
	};
	visit(tree);
	return { tree, headings };
}

/**
 * Bring a heading (by its id or the skill's own `#fragment`) or a GFM
 * footnote into view, and move focus to it.
 */
export function goToAnchor(id: string): void {
	const el =
		document.getElementById(ID_PREFIX + id) ?? document.getElementById(id);
	if (!el) return;
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
	el.focus({ preventScroll: true });
}

/**
 * Resolve a relative link against the file it appears in. Returns a
 * `/`-separated path inside the skill, or null for anything else.
 */
export function resolveLink(fromFile: string, href: string): string | null {
	if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/")) return null;
	const target = href.split(/[?#]/)[0];
	if (!target) return null;
	let decoded: string;
	try {
		decoded = decodeURIComponent(target);
	} catch {
		return null;
	}
	const parts = fromFile.split("/").slice(0, -1);
	for (const seg of decoded.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") {
			if (parts.length === 0) return null;
			parts.pop();
		} else {
			parts.push(seg);
		}
	}
	return parts.join("/");
}

const HEADING = "scroll-mt-4 font-semibold tracking-[-0.01em] text-ink";
const LINK = "cursor-pointer";

type Props<T extends keyof React.JSX.IntrinsicElements> = ComponentProps<T>;

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

/** Headings take focus (tabIndex -1) so jumping to one moves the reader there. */
function heading(Tag: HeadingTag, className: string) {
	return function MarkdownHeading({ children, ...p }: Props<HeadingTag>) {
		return (
			<Tag {...p} tabIndex={-1} className={cn(HEADING, className)}>
				{children}
			</Tag>
		);
	};
}

export function Markdown({
	parsed,
	file,
	files,
	onOpenFile,
}: {
	parsed: ParsedMarkdown;
	/** Path of this file inside the skill, for resolving relative links. */
	file: string;
	files: ReadonlySet<string>;
	onOpenFile: (path: string) => void;
}): ReactNode {
	return toJsxRuntime(parsed.tree, {
		Fragment,
		jsx,
		jsxs,
		components: {
			h1: heading("h1", "mt-8 mb-3 text-title first:mt-0"),
			h2: heading("h2", "mt-8 mb-2.5 text-heading first:mt-0"),
			h3: heading("h3", "mt-6 mb-2 text-body first:mt-0"),
			h4: heading("h4", "mt-5 mb-1.5 text-small"),
			h5: heading("h5", "mt-5 mb-1.5 text-small text-ink-soft"),
			h6: heading("h6", "mt-5 mb-1.5 text-small text-ink-soft"),
			p: (p: Props<"p">) => <p {...p} className="my-3" />,
			ul: (p: Props<"ul">) => (
				<ul
					{...p}
					className="my-3 list-disc pl-6 marker:text-ink-soft [&_ul]:my-1 [&_ol]:my-1"
				/>
			),
			ol: (p: Props<"ol">) => (
				<ol
					{...p}
					className="my-3 list-decimal pl-6 marker:text-ink-soft [&_ul]:my-1 [&_ol]:my-1"
				/>
			),
			li: (p: Props<"li">) => <li {...p} className="my-1 pl-1" />,
			blockquote: (p: Props<"blockquote">) => (
				<blockquote
					{...p}
					className="my-4 border-l-3 border-rule pl-4 text-ink-soft"
				/>
			),
			hr: () => <hr className="my-8 border-rule" />,
			code: (p: Props<"code">) => (
				<code
					{...p}
					className="rounded-sm border border-rule bg-raised px-1 py-px font-mono text-[0.86em] wrap-break-word"
				/>
			),
			// Inside a block, code drops its inline chip.
			pre: (p: Props<"pre">) => (
				<pre
					{...p}
					className="my-4 overflow-x-auto rounded-md border border-rule bg-raised px-3.5 py-2.5 font-mono text-code leading-relaxed [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em] [&>code]:wrap-normal"
				/>
			),
			table: (p: Props<"table">) => (
				<div className="my-4 overflow-x-auto">
					<table {...p} className="w-full text-small" />
				</div>
			),
			th: (p: Props<"th">) => (
				<th
					{...p}
					className="border-b border-ink py-1.5 pr-4 text-left align-bottom font-medium"
				/>
			),
			td: (p: Props<"td">) => (
				<td {...p} className="border-b border-rule py-1.5 pr-4 align-top" />
			),
			img: ({ alt, src }: Props<"img">) => (
				<span className="text-ink-soft">
					[Image not loaded:{" "}
					{alt || (typeof src === "string" ? src : "no description")}]
				</span>
			),
			a: ({ href, children }: Props<"a">) => {
				if (!href) return <>{children}</>;
				if (href.startsWith("#")) {
					return (
						<a
							href={href}
							className={LINK}
							onClick={(e) => {
								// The app routes on the hash; don't let an anchor change it.
								e.preventDefault();
								goToAnchor(decodeURIComponent(href.slice(1)));
							}}
						>
							{children}
						</a>
					);
				}
				if (/^(https?:|mailto:)/i.test(href)) {
					return (
						<a href={href} target="_blank" rel="noreferrer noopener">
							{children}
						</a>
					);
				}
				const target = resolveLink(file, href);
				if (target !== null && files.has(target)) {
					return (
						<a
							href={href}
							className={LINK}
							onClick={(e) => {
								e.preventDefault();
								onOpenFile(target);
							}}
						>
							{children}
						</a>
					);
				}
				// A path outside this skill or an unsafe scheme: keep the words, drop the link.
				return <>{children}</>;
			},
		},
	});
}
