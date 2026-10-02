import { useEffect, useMemo, useState } from "react";
import { Path } from "@/components/display";
import { Problem } from "@/components/problem";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
import {
	goToAnchor,
	type Heading,
	Markdown,
	parseMarkdown,
	splitFrontmatter,
} from "@/lib/markdown";
import { cn } from "@/lib/utils";
import type { SkillRecord } from "../../../../core/inventory/format.ts";
import type { CopyFiles, FileText } from "../../../data.ts";
import { copyItems } from "./copy-items.tsx";

function size(bytes: number): string {
	return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

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
	const [listing, setListing] = useState<CopyFiles | null>(null);
	const [file, setFile] = useState<string | null>(null);
	const [shown, setShown] = useState<FileText | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let live = true;
		api
			.copyFiles(skill.name, copy)
			.then((l) => {
				if (!live) return;
				setListing(l);
				setFile(entryFile(l.files));
				setError(null);
			})
			.catch((e: Error) => live && setError(e.message));
		return () => {
			live = false;
		};
	}, [skill.name, copy]);

	useEffect(() => {
		if (file === null) return;
		let live = true;
		api
			.copyFile(skill.name, copy, file)
			.then((f) => {
				if (!live) return;
				setShown(f);
				setError(null);
			})
			.catch((e: Error) => live && setError(e.message));
		return () => {
			live = false;
		};
	}, [skill.name, copy, file]);

	const isMarkdown = shown ? /\.(md|markdown)$/i.test(shown.path) : false;
	const doc = useMemo(() => {
		if (!shown?.text || !isMarkdown) return null;
		const { frontmatter, body } = splitFrontmatter(shown.text);
		return { frontmatter, parsed: parseMarkdown(body) };
	}, [shown, isMarkdown]);

	const paths = useMemo(
		() => new Set(listing?.files.map((f) => f.path)),
		[listing],
	);
	const open = (path: string) => {
		setFile(path);
		window.scrollTo({ top: 0 });
	};

	// Only show what belongs to the current selection; a stale file stays
	// hidden until its replacement arrives.
	const current = shown && shown.path === file ? shown : null;

	const copies = copyItems(skill.copies);
	const fileItems = (listing?.files ?? []).map((f) => ({
		value: f.path,
		label: (
			<>
				<Path>{f.path}</Path>
				<span className="text-ink-soft">{size(f.bytes)}</span>
			</>
		),
	}));

	return (
		<div className="mt-6 grid gap-x-12 split:grid-cols-[minmax(0,1fr)_220px]">
			<div className="min-w-0">
				<div className="mb-2 flex flex-wrap items-center gap-2">
					{skill.copies.length > 1 && (
						<Select
							items={copies}
							value={copy}
							onValueChange={(v) => {
								if (v === null) return;
								setListing(null);
								setFile(null);
								setShown(null);
								setCopy(v);
							}}
						>
							<SelectTrigger aria-label="Copy" className="max-w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{copies.map((it) => (
									<SelectItem key={it.value} value={it.value}>
										{it.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					{listing && listing.files.length > 1 && file && (
						<Select
							items={fileItems}
							value={file}
							onValueChange={(v) => v !== null && open(v)}
						>
							<SelectTrigger aria-label="File" className="max-w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{fileItems.map((it) => (
									<SelectItem key={it.value} value={it.value}>
										{it.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
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
									{doc.frontmatter}
								</pre>
							</details>
						)}
						<div className="max-w-[72ch] leading-[1.6]">
							<Markdown
								parsed={doc.parsed}
								file={current.path}
								files={paths}
								onOpenFile={open}
							/>
						</div>
					</>
				) : (
					<pre className="overflow-x-auto rounded-md border border-rule bg-raised px-3.5 py-2.5 font-mono text-code leading-relaxed">
						{current.text}
					</pre>
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
