import { useMemo } from "react";
import { grammarForFile, type Highlight, useHighlight } from "@/lib/highlight";
import {
	type ParsedMarkdown,
	parseMarkdown,
	splitFrontmatter,
} from "@/lib/markdown";
import type { FileText } from "../../../data.ts";

export interface FileDocument {
	/** A markdown file, its frontmatter split off; null for any other file. */
	markdown: { frontmatter: string | null; parsed: ParsedMarkdown } | null;
	/** The grammar for a file that isn't markdown, if there is one. */
	grammar: string | null;
	/** Null until the grammars the file needs have loaded. */
	highlight: Highlight | null;
}

/** A file ready to show: markdown parsed once, highlighting loading behind it. */
export function useFileDocument(file: FileText | null): FileDocument {
	const isMarkdown = file ? /\.(md|markdown)$/i.test(file.path) : false;
	const markdown = useMemo(() => {
		if (!file?.text || !isMarkdown) return null;
		const { frontmatter, body } = splitFrontmatter(file.text);
		return { frontmatter, parsed: parseMarkdown(body) };
	}, [file, isMarkdown]);

	// Grammars this file needs: its fences and frontmatter, or the file itself.
	const grammar = file && !isMarkdown ? grammarForFile(file.path) : null;
	const languages = useMemo(
		() =>
			markdown
				? [
						...markdown.parsed.languages,
						...(markdown.frontmatter !== null ? ["yaml"] : []),
					]
				: grammar
					? [grammar]
					: [],
		[markdown, grammar],
	);
	const highlight = useHighlight(languages);
	return { markdown, grammar, highlight };
}
