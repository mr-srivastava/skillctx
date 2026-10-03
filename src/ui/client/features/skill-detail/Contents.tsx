import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { Path, Toolbar } from "@/components/display";
import { Picker, type PickerItem } from "@/components/picker";
import { Problem } from "@/components/problem";
import { formatBytes } from "@/lib/format";
import { CodeText, grammarForFile, useHighlight } from "@/lib/highlight";
import {
	goToAnchor,
	type Heading,
	Markdown,
	parseMarkdown,
	splitFrontmatter,
} from "@/lib/markdown";
import { copyFileQuery, copyFilesQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { SkillRecord } from "../../../../core/inventory/format.ts";
import type { CopyFiles } from "../../../data.ts";
import { copyItems } from "./copy-items.tsx";

/** The file a skill opens on: SKILL.md, or the first file if it's missing. */
function entryFile(files: CopyFiles["files"]): string | null {
	return (
		files.find((f) => f.path === "SKILL.md")?.path ?? files[0]?.path ?? null
	);
}

/**
 * What a skill says: one copy's files, SKILL.md first, rendered read-only.
 * Starts on the copy most locations use.
 */
export function Contents({
	skill,
	mainCopy,
}: {
	skill: SkillRecord;
	mainCopy: number;
}) {
	const [copy, setCopy] = useState(mainCopy);
	/** The file picked; null opens the copy's entry file. */
	const [picked, setPicked] = useState<string | null>(null);
	const listingQuery = useQuery(copyFilesQuery(skill.name, copy));
	const listing = listingQuery.data ?? null;
	const file = picked ?? (listing ? entryFile(listing.files) : null);
	const fileQuery = useQuery(copyFileQuery(skill.name, copy, file));
	// Keyed by copy and path, so only the current selection's file shows.
	const current = fileQuery.data ?? null;
	const error = listingQuery.error?.message ?? fileQuery.error?.message ?? null;

	const isMarkdown = current ? /\.(md|markdown)$/i.test(current.path) : false;
	const doc = useMemo(() => {
		if (!current?.text || !isMarkdown) return null;
		const { frontmatter, body } = splitFrontmatter(current.text);
		return { frontmatter, parsed: parseMarkdown(body) };
	}, [current, isMarkdown]);

	// Grammars this file needs: its fences and frontmatter, or the file itself.
	const fileGrammar =
		current && !isMarkdown ? grammarForFile(current.path) : null;
	const languages = useMemo(
		() =>
			doc
				? [
						...doc.parsed.languages,
						...(doc.frontmatter !== null ? ["yaml"] : []),
					]
				: fileGrammar
					? [fileGrammar]
					: [],
		[doc, fileGrammar],
	);
	const highlight = useHighlight(languages);

	const paths = useMemo(
		() => new Set(listing?.files.map((f) => f.path)),
		[listing],
	);
	const open = (path: string) => {
		setPicked(path);
		window.scrollTo({ top: 0 });
	};

	const copies = copyItems(skill.copies);
	const fileItems: PickerItem<string>[] = (listing?.files ?? []).map((f) => ({
		value: f.path,
		label: (
			<>
				<Path>{f.path}</Path>
				<span className="text-ink-soft">{formatBytes(f.bytes)}</span>
			</>
		),
	}));

	return (
		<div className="mt-6 grid gap-x-12 split:grid-cols-[minmax(0,1fr)_220px]">
			<div className="min-w-0">
				<Toolbar className="mb-2 empty:hidden">
					{skill.copies.length > 1 && (
						<Picker
							items={copies}
							value={copy}
							onChange={(v) => {
								setPicked(null);
								setCopy(v);
							}}
							label="Copy"
						/>
					)}
					{listing && listing.files.length > 1 && file && (
						<Picker
							items={fileItems}
							value={file}
							onChange={open}
							label="File"
						/>
					)}
				</Toolbar>
				{listing && file && (
					<p className="mb-6 text-caption text-ink-soft wrap-anywhere">
						<Path>
							{listing.realPath}/{file}
						</Path>
						{skill.drift &&
							(copy === mainCopy
								? ". The copies differ; this is the one most locations use."
								: ". The copies differ; most locations use another one.")}
					</p>
				)}

				{error ? (
					<Problem title="Couldn't read this skill's files">{error}</Problem>
				) : listing && listing.files.length === 0 ? (
					<p className="text-ink-soft">
						This copy's folder is empty or can't be read. Rescan to update the
						inventory.
					</p>
				) : !current ? (
					<p className="text-ink-soft">Loading…</p>
				) : current.text === null ? (
					<p className="text-ink-soft">
						This file is binary or larger than 256 KB, so it isn't shown.
					</p>
				) : doc ? (
					<>
						{doc.frontmatter !== null && (
							<details className="mb-6 rounded-md border border-rule bg-raised">
								<summary className="cursor-pointer px-3.5 py-2 text-small text-ink-soft hover:text-ink">
									Frontmatter
								</summary>
								<pre className="overflow-x-auto border-t border-rule px-3.5 py-2.5 font-mono text-code leading-relaxed">
									<CodeText
										code={doc.frontmatter}
										lang="yaml"
										highlight={highlight}
									/>
								</pre>
							</details>
						)}
						<div className="max-w-reading leading-[1.6]">
							<Markdown
								parsed={doc.parsed}
								file={current.path}
								files={paths}
								onOpenFile={open}
								highlight={highlight}
							/>
						</div>
					</>
				) : (
					<CodeBlock>
						<CodeText
							code={current.text}
							lang={fileGrammar}
							highlight={highlight}
						/>
					</CodeBlock>
				)}
			</div>
			{doc && <Outline headings={doc.parsed.headings} />}
		</div>
	);
}

/**
 * The file's headings, for jumping around long skills. Shown beside the text
 * on wide screens only; on narrow ones the text reads top to bottom.
 */
function Outline({ headings }: { headings: Heading[] }) {
	const inner = headings.filter((h) => h.depth === 2 || h.depth === 3);
	const items = inner.length > 0 ? inner : headings.filter((h) => h.depth <= 3);
	if (items.length < 2) return null;
	const top = Math.min(...items.map((h) => h.depth));
	return (
		<nav
			aria-labelledby="outline-label"
			className="sticky top-4 hidden max-h-[calc(100vh-2rem)] self-start overflow-y-auto split:block"
		>
			<h2
				id="outline-label"
				className="mb-2 text-caption font-medium text-ink-soft"
			>
				On this page
			</h2>
			<ul className="border-l border-rule">
				{items.map((h) => (
					<li key={h.id}>
						<button
							type="button"
							className={cn(
								"-ml-px block w-full cursor-pointer border-l border-transparent py-1 pr-1 text-left text-small leading-snug text-ink-soft hover:border-ink hover:text-ink",
								h.depth > top ? "pl-6" : "pl-3",
							)}
							onClick={() => goToAnchor(h.id)}
						>
							{h.text}
						</button>
					</li>
				))}
			</ul>
		</nav>
	);
}
