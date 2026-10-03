import {
	ArrowLeftIcon,
	CheckIcon,
	CircleAlertIcon,
	CopyIcon,
	type LucideIcon,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { Notes, Path } from "@/components/display";
import { Hint } from "@/components/Hint";
import { DiffersDot, ListLegend, LocationIcons } from "@/components/presence";
import { Problem } from "@/components/problem";
import { SkillStatuses, STATUS } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemSeparator,
} from "@/components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Advice, adviceFor } from "@/lib/advice";
import { formatBytes, plural } from "@/lib/format";
import { copyPresence, mainCopy, type Row } from "@/lib/model";
import { cn } from "@/lib/utils";
import type {
	InventorySummary,
	SkillRecord,
} from "../../../../core/inventory/format.ts";
import {
	provenanceDetails,
	sourceLabel,
} from "../../../../core/provenance/kinds.ts";
import { Contents } from "./Contents.tsx";
import { DiffView } from "./DiffView.tsx";

type CopyState = "idle" | "copied" | "failed";

function CopyButton({ text }: { text: string }) {
	const [state, setState] = useState<CopyState>("idle");
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);

	const show = (next: CopyState, ms: number) => {
		clearTimeout(timer.current);
		setState(next);
		timer.current = setTimeout(() => setState("idle"), ms);
	};

	return (
		<>
			<Hint text="Copy command">
				<Button
					variant="ghost"
					size="icon-sm"
					className={
						state === "failed" ? "text-problem" : "text-ink-soft hover:text-ink"
					}
					aria-label="Copy command"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(text);
							show("copied", 1500);
						} catch {
							// Clipboard access can be denied (permissions, embedded
							// browsers). Say so; the command is still selectable.
							show("failed", 4000);
						}
					}}
				>
					{state === "copied" ? (
						<CheckIcon aria-hidden />
					) : state === "failed" ? (
						<CircleAlertIcon aria-hidden />
					) : (
						<CopyIcon aria-hidden />
					)}
				</Button>
			</Hint>
			<span
				className={state === "failed" ? "text-caption text-problem" : "sr-only"}
				role="status"
			>
				{state === "copied"
					? "Copied"
					: state === "failed"
						? "Couldn't copy. Select the command and copy it instead."
						: ""}
			</span>
		</>
	);
}

/** The icon and colour for a piece of advice: its status's, or a problem's. */
function adviceLook(kind: Advice["kind"]): { icon: LucideIcon; tone: string } {
	return kind === "error"
		? { icon: CircleAlertIcon, tone: "text-problem" }
		: STATUS[kind];
}

function AdviceNotes({ skill, row }: { skill: SkillRecord; row?: Row }) {
	const items = adviceFor(skill, row);
	if (items.length === 0) return null;
	return (
		<Notes>
			{items.map(({ key, kind, text, command }) => {
				const { icon: Icon, tone } = adviceLook(kind);
				return (
					<li key={key} className="flex gap-2.5">
						<Icon aria-hidden className={cn("mt-1 size-4 shrink-0", tone)} />
						<div className="min-w-0">
							{text}
							{command && (
								<div className="mt-2 flex flex-wrap items-center gap-2">
									<code className="max-w-full overflow-x-auto rounded-md border border-rule bg-paper px-2.5 py-1.5 font-mono text-caption whitespace-nowrap">
										{command}
									</code>
									<CopyButton text={command} />
								</div>
							)}
						</div>
					</li>
				);
			})}
		</Notes>
	);
}

export type DetailTab = "contents" | "where" | "copies";

type Copy = SkillRecord["copies"][number];

/** One label-value pair in the header's summary strip. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<dt className="text-ink-soft">{label}</dt>
			<dd className="flex min-w-0 items-center gap-2 text-ink">{children}</dd>
		</div>
	);
}

/**
 * The same parts as a skill card on the Library page (name, states,
 * description, locations as logos), laid out as a page header.
 */
function Header({
	skill,
	row,
	roots,
}: {
	skill: SkillRecord;
	row?: Row;
	roots: string[];
}) {
	const sources = row?.sources.map(sourceLabel).join(", ");
	const locations = row ? roots.filter((id) => row.presence[id]).length : 0;
	return (
		<header className="mt-7 mb-6 wide:mt-9">
			<a
				href="#/"
				className="inline-flex items-center gap-1.5 text-caption text-ink-soft no-underline hover:text-ink"
			>
				<ArrowLeftIcon aria-hidden className="size-3.5" />
				Library
			</a>
			<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
				<h1 className="font-mono text-[clamp(22px,2.6vw,28px)] leading-tight font-semibold tracking-[-0.02em] wrap-anywhere">
					{skill.name}
				</h1>
				{row && <SkillStatuses row={row} compact />}
			</div>
			<p className="mt-1.5 max-w-reading text-ink-soft">
				{skill.description || "No description."}
			</p>
			<dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-rule py-2.5 text-caption">
				{row && locations > 0 && (
					<Fact label={plural(locations, "location")}>
						<LocationIcons presence={row.presence} roots={roots} max={8} />
					</Fact>
				)}
				<Fact label="Copies">
					<span className="tabular-nums">{skill.copies.length}</span>
					{skill.drift && (
						<span className="inline-flex items-center gap-1.5 text-ink-soft">
							<DiffersDot /> {skill.versions} versions
						</span>
					)}
				</Fact>
				{sources && <Fact label="Installed by">{sources}</Fact>}
			</dl>
		</header>
	);
}

/** Size and state of one copy, in the style of a list row's description. */
function copyFacts(copy: Copy, index: number, isMain: boolean): string {
	return [
		`Copy ${index + 1}`,
		plural(copy.fileCount, "file"),
		formatBytes(copy.bytes),
		...(isMain ? [] : ["different content"]),
		...(copy.installState === "modified" ? ["edited after install"] : []),
	].join(" · ");
}

/**
 * Each copy on disk as a row, like the Library list: its folder, which
 * locations read it (logos; the hint says folder or symlink), and what
 * installed it.
 */
function CopyList({ skill, roots }: { skill: SkillRecord; roots: string[] }) {
	const main = mainCopy(skill);
	const untracked = skill.copies.every((c) => c.provenance.length === 0);
	return (
		<>
			<ListLegend
				count={`${plural(skill.copies.length, "copy", "copies")} on disk`}
				differs={skill.drift}
			/>
			<ItemGroup aria-label="Copies on disk">
				{skill.copies.map((c, i) => (
					<Fragment key={c.realPath}>
						{i > 0 && <ItemSeparator />}
						<Item role="listitem" size="sm" className="items-start px-2">
							<ItemContent className="min-w-0 basis-[320px]">
								<span className="font-mono text-small font-semibold wrap-anywhere">
									{c.realPath}
								</span>
								<ItemDescription>
									{copyFacts(c, i, c.hash === main?.hash)}
								</ItemDescription>
								{c.provenance.length > 0 && (
									<ul className="mt-1 grid gap-0.5 text-caption">
										{c.provenance.map((p) => (
											<li key={p.kind} className="wrap-break-word">
												<span className="font-medium">
													{sourceLabel(p.kind)}
												</span>
												<span className="text-ink-soft">: </span>
												<ProvenanceText p={p} />
											</li>
										))}
									</ul>
								)}
							</ItemContent>
							<div className="self-start pt-0.5 wide:w-[180px]">
								<LocationIcons
									presence={copyPresence(skill, c)}
									roots={roots}
									max={8}
								/>
							</div>
						</Item>
					</Fragment>
				))}
			</ItemGroup>
			{untracked && (
				<p className="mt-4 max-w-reading text-caption text-ink-soft">
					No installer recorded this skill, so it can't be checked for updates.
				</p>
			)}
		</>
	);
}

export function SkillDetail({
	skill,
	row,
	summary,
	tab,
	onTab,
}: {
	skill: SkillRecord;
	row?: Row;
	summary: InventorySummary;
	tab: DetailTab;
	onTab: (tab: DetailTab) => void;
}) {
	const roots = summary.roots.filter((r) => r.present).map((r) => r.id);
	const main = mainCopy(skill);
	const mainIndex = main ? skill.copies.indexOf(main) : 0;
	const canCompare = skill.versions > 1;
	const shownTab = tab === "copies" && !canCompare ? "contents" : tab;
	return (
		<article>
			<Header skill={skill} row={row} roots={roots} />

			<AdviceNotes skill={skill} row={row} />
			{skill.copies.some((c) => c.diagnostics.length > 0) && (
				<div className="mb-2 grid max-w-reading gap-2">
					{skill.copies
						.filter((c) => c.diagnostics.length > 0)
						.map((c) => (
							// Part of the page, not a live event: don't interrupt a
							// screen reader the way role="alert" would.
							<Problem
								key={c.realPath}
								role="note"
								title={<Path>{c.realPath}</Path>}
							>
								<ul>
									{c.diagnostics.map((d) => (
										<li key={d}>{d}</li>
									))}
								</ul>
							</Problem>
						))}
				</div>
			)}

			<Tabs
				value={shownTab}
				onValueChange={(v) => onTab(v as DetailTab)}
				className="mt-8"
			>
				<TabsList>
					<TabsTrigger value="contents">Contents</TabsTrigger>
					<TabsTrigger value="where">Where it lives</TabsTrigger>
					{canCompare && (
						<TabsTrigger value="copies">Compare copies</TabsTrigger>
					)}
				</TabsList>
				<TabsContent value="contents">
					<Contents key={skill.name} skill={skill} mainCopy={mainIndex} />
				</TabsContent>
				<TabsContent value="where" className="pt-6">
					<CopyList skill={skill} roots={roots} />
				</TabsContent>
				{canCompare && (
					<TabsContent value="copies" className="pt-6">
						<DiffView skill={skill} />
					</TabsContent>
				)}
			</Tabs>
		</article>
	);
}

function ProvenanceText({
	p,
}: {
	p: SkillRecord["copies"][number]["provenance"][number];
}) {
	return provenanceDetails(p).map((d, i) =>
		d.as === "path" ? (
			<Path key={i}>{d.text}</Path>
		) : d.as === "soft" ? (
			<span key={i} className="text-ink-soft">
				{d.text}
			</span>
		) : (
			d.text
		),
	);
}
