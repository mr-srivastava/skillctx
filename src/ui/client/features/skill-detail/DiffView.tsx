import {
	FileDiffIcon,
	FileMinusIcon,
	FilePlusIcon,
	type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Path, TOOLBAR } from "@/components/display";
import { Problem } from "@/components/problem";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
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
	const [diff, setDiff] = useState<CopyDiff | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (a === b) {
			// oxlint-disable-next-line react/set-state-in-effect -- clears the previous pair's diff.
			setDiff(null);
			return;
		}
		// A slower response for an earlier pair must not replace this one.
		let live = true;
		api
			.copyDiff(skill.name, a, b)
			.then((d) => {
				if (!live) return;
				setDiff(d);
				setError(null);
			})
			.catch((e: Error) => live && setError(e.message));
		return () => {
			live = false;
		};
	}, [skill.name, a, b]);

	const copies = copyItems(skill.copies);

	const pick = (
		value: number,
		onChange: (n: number) => void,
		label: string,
	) => (
		<Select
			items={copies}
			value={value}
			onValueChange={(v) => v !== null && onChange(v)}
		>
			<SelectTrigger aria-label={label} className="max-w-full">
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
	);

	return (
		<>
			<div className={cn(TOOLBAR, "mb-3.5")}>
				{pick(a, setA, "Compare")} <span className="text-ink-soft">with</span>{" "}
				{pick(b, setB, "With")}
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
		<pre className="overflow-x-auto rounded-md border border-rule bg-raised py-2 font-mono text-code leading-normal">
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
		</pre>
	);
}
