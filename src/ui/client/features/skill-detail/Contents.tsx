import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Path, Toolbar } from "@/components/display";
import { Picker, type PickerItem } from "@/components/picker";
import { formatBytes } from "@/lib/format";
import { copyFileQuery, copyFilesQuery } from "@/lib/queries";
import type { SkillRecord } from "../../../../core/inventory/format.ts";
import type { CopyFiles } from "../../../data.ts";
import { copyItems } from "./copy-items.tsx";
import { FileBody } from "./FileBody.tsx";
import { Outline } from "./Outline.tsx";
import { useFileDocument } from "./use-file-document.ts";

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
	const doc = useFileDocument(current);

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
				<FileBody
					error={error}
					empty={listing?.files.length === 0}
					file={current}
					doc={doc}
					files={paths}
					onOpenFile={open}
				/>
			</div>
			{doc.markdown && <Outline headings={doc.markdown.parsed.headings} />}
		</div>
	);
}
