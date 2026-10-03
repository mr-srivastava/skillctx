import { CodeBlock } from "@/components/code-block";
import { Problem } from "@/components/problem";
import type { FileText } from "@/lib/core";
import { CodeText } from "@/lib/highlight";
import { Markdown } from "@/lib/markdown";
import type { FileDocument } from "./use-file-document.ts";

/**
 * The picked file, read-only: markdown rendered with its frontmatter folded
 * away, anything else as text. Says why when there's nothing to show.
 */
export function FileBody({
	error,
	empty,
	file,
	doc,
	files,
	onOpenFile,
}: {
	error: string | null;
	/** The copy has no files to show. */
	empty: boolean;
	/** Null while it loads. */
	file: FileText | null;
	doc: FileDocument;
	/** Every path in the copy, for links between its files. */
	files: ReadonlySet<string>;
	onOpenFile: (path: string) => void;
}) {
	if (error) {
		return <Problem title="Couldn't read this skill's files">{error}</Problem>;
	}
	if (empty) {
		return (
			<p className="text-ink-soft">
				This copy's folder is empty or can't be read. Rescan to update the
				inventory.
			</p>
		);
	}
	if (!file) return <p className="text-ink-soft">Loading…</p>;
	if (file.text === null) {
		return (
			<p className="text-ink-soft">
				This file is binary or larger than 256 KB, so it isn't shown.
			</p>
		);
	}
	const { markdown, grammar, highlight } = doc;
	if (!markdown) {
		return (
			<CodeBlock>
				<CodeText code={file.text} lang={grammar} highlight={highlight} />
			</CodeBlock>
		);
	}
	return (
		<>
			{markdown.frontmatter !== null && (
				<details className="mb-6 rounded-md border border-rule bg-raised">
					<summary className="cursor-pointer px-3.5 py-2 text-small text-ink-soft hover:text-ink">
						Frontmatter
					</summary>
					<pre className="overflow-x-auto border-t border-rule px-3.5 py-2.5 font-mono text-code leading-relaxed">
						<CodeText
							code={markdown.frontmatter}
							lang="yaml"
							highlight={highlight}
						/>
					</pre>
				</details>
			)}
			<div className="max-w-reading leading-[1.6]">
				<Markdown
					parsed={markdown.parsed}
					file={file.path}
					files={files}
					onOpenFile={onOpenFile}
					highlight={highlight}
				/>
			</div>
		</>
	);
}
