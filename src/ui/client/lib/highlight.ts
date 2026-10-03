import type { ElementContent } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { HighlighterCore, LanguageRegistration } from "shiki/core";

/*
 * Syntax highlighting for code in skill files (ADR-018). Shiki loads on first
 * use, and each grammar only when a file needs it, so pages without code pay
 * nothing. Tokens are coloured with CSS variables (--code-token-*, defined in
 * styles.css), so highlighting follows the page palette and dark mode.
 */

type Grammar = () => Promise<{ default: LanguageRegistration[] }>;

const GRAMMARS: Record<string, Grammar> = {
	bash: () => import("shiki/langs/bash.mjs"),
	css: () => import("shiki/langs/css.mjs"),
	diff: () => import("shiki/langs/diff.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	markdown: () => import("shiki/langs/markdown.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	toml: () => import("shiki/langs/toml.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	yaml: () => import("shiki/langs/yaml.mjs"),
};

/**
 * Fence names and file extensions that mean one of the grammars above. The
 * tsx grammar is a superset of JavaScript, JSX and TypeScript, so it serves
 * all four; each of those grammars is about 180 KB.
 */
const ALIASES: Record<string, string> = {
	sh: "bash",
	shell: "bash",
	zsh: "bash",
	cjs: "tsx",
	javascript: "tsx",
	js: "tsx",
	jsx: "tsx",
	mjs: "tsx",
	mts: "tsx",
	ts: "tsx",
	typescript: "tsx",
	jsonc: "json",
	md: "markdown",
	py: "python",
	yml: "yaml",
};

const THEME = "skillctx";

/** The grammar for a fence name or file extension, or null to leave it plain. */
export function grammarFor(name: string | undefined): string | null {
	const key = name?.toLowerCase() ?? "";
	const grammar = ALIASES[key] ?? key;
	return grammar in GRAMMARS ? grammar : null;
}

/** The grammar for a file, by its extension. */
export function grammarForFile(path: string): string | null {
	return grammarFor(/\.([^./]+)$/.exec(path)?.[1]);
}

/** Highlighted lines for a piece of code, or null if its grammar isn't loaded. */
export type Highlight = (code: string, lang: string) => ElementContent[] | null;

let core: Promise<HighlighterCore> | undefined;

function loadCore(): Promise<HighlighterCore> {
	core ??= Promise.all([
		import("shiki/core"),
		import("shiki/engine/javascript"),
	]).then(([shiki, engine]) =>
		shiki.createHighlighterCore({
			themes: [
				shiki.createCssVariablesTheme({
					name: THEME,
					variablePrefix: "--code-",
				}),
			],
			langs: [],
			engine: engine.createJavaScriptRegexEngine(),
		}),
	);
	// A failed load leaves code plain; the next file tries again.
	core.catch(() => {
		core = undefined;
	});
	return core;
}

/** Load the highlighter with these grammars (names or aliases). */
export async function loadHighlight(
	langs: readonly string[],
): Promise<Highlight> {
	const hl = await loadCore();
	const wanted = langs.map(grammarFor).filter((g): g is string => g !== null);
	const loaded = new Set(hl.getLoadedLanguages());
	const missing = [...new Set(wanted)].filter((g) => !loaded.has(g));
	await Promise.all(
		missing.map(async (g) =>
			hl.loadLanguage((await (GRAMMARS[g] as Grammar)()).default),
		),
	);
	return (code, name) => {
		const lang = grammarFor(name);
		if (!lang || !hl.getLoadedLanguages().includes(lang)) return null;
		// Shiki returns <pre><code>lines</code></pre>; the caller owns the <pre>.
		const pre = hl.codeToHast(code.replace(/\n$/, ""), { lang, theme: THEME })
			.children[0];
		const inner = pre?.type === "element" ? pre.children[0] : undefined;
		return inner?.type === "element" ? inner.children : null;
	};
}

/**
 * A Highlight for these grammars once they've loaded; null until then, and
 * code renders plain meanwhile.
 */
export function useHighlight(langs: readonly string[]): Highlight | null {
	const key = [...new Set(langs.map(grammarFor))]
		.filter((g) => g !== null)
		.sort()
		.join(",");
	const [highlight, setHighlight] = useState<{ fn: Highlight } | null>(null);
	useEffect(() => {
		if (!key) return;
		let live = true;
		loadHighlight(key.split(","))
			.then((fn) => live && setHighlight({ fn }))
			.catch(() => {});
		return () => {
			live = false;
		};
	}, [key]);
	return highlight?.fn ?? null;
}

/** Code as React nodes: highlighted if possible, otherwise the plain text. */
export function CodeText({
	code,
	lang,
	highlight,
}: {
	code: string;
	lang: string | null;
	highlight: Highlight | null;
}): ReactNode {
	const lines = useMemo(
		() => (lang && highlight ? highlight(code, lang) : null),
		[code, lang, highlight],
	);
	if (!lines) return code;
	return toJsxRuntime(
		{ type: "root", children: lines },
		{ Fragment, jsx, jsxs },
	);
}
