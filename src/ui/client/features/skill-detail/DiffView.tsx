import { useQuery } from "@tanstack/react-query";
import {
	FileDiffIcon,
	FileMinusIcon,
	FilePlusIcon,
	type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { Path, TOOLBAR } from "@/components/display";
import { Picker } from "@/components/picker";
import { Problem } from "@/components/problem";
import { copyDiffQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { SkillRecord } from "../../../../core/inventory/format.ts";
import type { CopyDiff } from "../../../data.ts";
import { copyItems } from "./copy-items.tsx";

export function DiffView({ skill }: { skill: SkillRecord }) {
	const [a, setA] = useState(0);
	const [b, setB] = useState(() =>
		Math.max(
			1,
			skill.copies.findIndex((c) => c.hash !== skill.copies[0]?.hash),
		),
	);
	// Keyed by the pair, so a slow response for an earlier pair can't show;
	// disabled (no data) when both sides are the same copy.
	const query = useQuery(copyDiffQuery(skill.name, a, b));
	const diff = query.data ?? null;
	const error = query.error?.message ?? null;

	const copies = copyItems(skill.copies);

	return (
		<>
			<div className={cn(TOOLBAR, "mb-3.5")}>
				<Picker items={copies} value={a} onChange={setA} label="Compare" />{" "}
				<span className="text-ink-soft">with</span>{" "}
				<Picker items={copies} value={b} onChange={setB} label="With" />
			</div>
			{a === b && (
				<p className="my-4 text-ink-soft">Pick two different copies.</p>
			)}
			{error && (
				<Problem className="my-4" title="Couldn't compare these copies">
					{error}
				</Problem>
			)}
			{diff && diff.files.length === 0 && (
				<p className="my-4 text-ink-soft">These two copies are identical.</p>
			)}
			{diff?.files.map((f) => (
				<section key={f.path}>
					<h3 className="mt-5 mb-1.5 flex flex-wrap items-center gap-x-1.5 text-small font-medium">
						<FileIcon status={f.status} />
						<Path>{f.path}</Path>
						<span className="text-ink-soft">
							{f.status === "changed"
								? "changed"
								: f.status === "only-left"
									? `only in copy ${a + 1}`
									: `only in copy ${b + 1}`}
							{f.binary ? ", too large or binary to show" : ""}
						</span>
					</h3>
					{f.patch && <Patch text={f.patch} />}
				</section>
			))}
		</>
	);
}

type FileStatus = CopyDiff["files"][number]["status"];

const FILE_ICON: Record<FileStatus, LucideIcon> = {
	changed: FileDiffIcon,
	"only-left": FileMinusIcon,
	"only-right": FilePlusIcon,
};

/** Decorative: the text after the path already says how the file differs. */
function FileIcon({ status }: { status: FileStatus }) {
	const Icon = FILE_ICON[status];
	return <Icon aria-hidden className="size-3.5 shrink-0 text-ink-soft" />;
}

function Patch({ text }: { text: string }) {
	// Key each line by its character offset: unique and stable for a given patch.
	let offset = 0;
	const lines = text
		.split("\n")
		.slice(4)
		.map((line) => {
			const key = offset;
			// oxlint-disable-next-line react/immutability -- a local counter during render, not state.
			offset += line.length + 1;
			return { key, line };
		});
	return (
		<CodeBlock className="px-0 py-2 leading-normal">
			{lines.map(({ key, line }) => (
				<span
					key={key}
					className={cn(
						"block px-3.5 whitespace-pre-wrap wrap-anywhere",
						line.startsWith("+")
							? "bg-add"
							: line.startsWith("-")
								? "bg-del"
								: line.startsWith("@@") && "text-ink-soft",
					)}
				>
					{line}
					{"\n"}
				</span>
			))}
		</CodeBlock>
	);
}
