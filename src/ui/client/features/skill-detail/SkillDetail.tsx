import {
	ArrowLeftIcon,
	CheckIcon,
	CircleAlertIcon,
	CopyIcon,
	type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	DESC,
	H2,
	Notes,
	Path,
	STATUS_ICON,
	STATUS_TEXT,
} from "@/components/display";
import { Hint } from "@/components/Hint";
import { CELL, Cell } from "@/components/presence";
import { Problem } from "@/components/problem";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Presence, Row } from "@/lib/model";
import { cn } from "@/lib/utils";
import type {
	InventorySummary,
	SkillRecord,
} from "../../../../core/inventory/format.ts";
import {
	provenanceDetails,
	sourceLabel,
	updateCommand,
} from "../../../../core/provenance/kinds.ts";
import { rootLabel } from "../../../../core/sources/roots.ts";
import { Contents } from "./Contents.tsx";
import { DiffView } from "./DiffView.tsx";

const FACT =
	"grid gap-0.5 border-b border-rule py-2.25 wide:grid-cols-[180px_1fr] wide:gap-4";

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

function shortRepo(url: string): string {
	return url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
}

function Advice({ skill, row }: { skill: SkillRecord; row?: Row }) {
	const items: {
		key: string;
		icon: LucideIcon;
		/** Text colour for the icon. */
		tone: string;
		text: string;
		command?: string;
	}[] = [];
	for (const u of row?.upstream ?? []) {
		const command =
			u.status === "outdated"
				? updateCommand(u.via, skill.name, u.copy)
				: undefined;
		if (command) {
			items.push({
				key: `up-${u.copy}-${u.via}`,
				icon: STATUS_ICON.outdated,
				tone: STATUS_TEXT.outdated,
				text: `${shortRepo(u.repo)} has a newer version. To update:`,
				command,
			});
		}
		if (u.status === "error") {
			items.push({
				key: `err-${u.copy}`,
				icon: CircleAlertIcon,
				tone: "text-problem",
				text: `Couldn't check for updates: ${u.error}`,
			});
		}
	}
	const edited = row?.statuses.includes("edited");
	if (edited && row?.statuses.includes("outdated")) {
		items.push({
			key: "edited-outdated",
			icon: STATUS_ICON.edited,
			tone: STATUS_TEXT.edited,
			text: "You edited this skill after installing it. Updating replaces those edits, so save anything you want to keep first.",
		});
	} else if (edited) {
		items.push({
			key: "edited",
			icon: STATUS_ICON.edited,
			tone: STATUS_TEXT.edited,
			text: "You edited this skill after installing it. The next update will replace those edits.",
		});
	}
	if (skill.drift) {
		items.push({
			key: "drift",
			icon: STATUS_ICON.drift,
			tone: STATUS_TEXT.drift,
			text: "Agents reading different locations see different versions of this skill. Compare copies shows what differs.",
		});
	}
	if (items.length === 0) return null;
	return (
		<Notes>
			{items.map(({ key, icon: Icon, tone, text, command }) => (
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
			))}
		</Notes>
	);
}

export type DetailTab = "contents" | "where" | "copies";

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
	const roots = summary.roots.filter((r) => r.present);
	const main = [...skill.copies].sort(
		(a, b) => b.seenIn.length - a.seenIn.length,
	)[0];
	const mainIndex = main ? skill.copies.indexOf(main) : 0;
	const canCompare = skill.versions > 1;
	const shownTab = tab === "copies" && !canCompare ? "contents" : tab;
	return (
		<article>
			<p className="mt-7 text-small">
				<a href="#/" className="inline-flex items-center gap-1.5">
					<ArrowLeftIcon aria-hidden className="size-3.5" />
					All skills
				</a>
			</p>
			<h1 className="mt-2.5 mb-1.5 font-mono text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] wrap-break-word">
				{skill.name}
			</h1>
			<p className="mb-6 max-w-[68ch] text-ink-soft">{skill.description}</p>

			<Advice skill={skill} row={row} />
			{skill.copies.some((c) => c.diagnostics.length > 0) && (
				<div className="mb-2 grid max-w-[72ch] gap-2">
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
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr>
									<th scope="col" className={CELL.headSkill}>
										Folder on disk
									</th>
									{roots.map((r) => (
										<th key={r.id} scope="col" className={CELL.headLoc}>
											<span className="inline-block px-1 py-0.5">
												{rootLabel(r.id)}
											</span>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{skill.copies.map((c, i) => (
									<tr key={c.realPath} className="hover:bg-raised">
										<th scope="row" className={CELL.bodySkill}>
											<Path>{c.realPath}</Path>
											<span className={DESC}>
												Copy {i + 1}, {c.fileCount}{" "}
												{c.fileCount === 1 ? "file" : "files"},{" "}
												{(c.bytes / 1024).toFixed(1)} KB
												{c.installState === "modified" &&
													", edited after install"}
											</span>
										</th>
										{roots.map((r) => {
											const e = c.seenIn.find((s) => s.root === r.id);
											const p: Presence = !e
												? "absent"
												: c.hash !== main?.hash
													? "differs"
													: e.symlink
														? "link"
														: "folder";
											return (
												<td key={r.id} className={CELL.bodyLoc}>
													<Cell presence={p} root={r.id} />
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<h2 className={H2}>Installed by</h2>
					<dl className="max-w-[80ch]">
						{skill.copies.flatMap((c, i) =>
							c.provenance.map((p) => (
								<div key={`${c.realPath}-${p.kind}`} className={FACT}>
									<dt className="text-ink-soft">{sourceLabel(p.kind)}</dt>
									<dd className="wrap-break-word">
										<ProvenanceText p={p} />
										{skill.copies.length > 1 && (
											<span className="text-ink-soft"> (copy {i + 1})</span>
										)}
									</dd>
								</div>
							)),
						)}
						{skill.copies.every((c) => c.provenance.length === 0) && (
							<div className={FACT}>
								<dt className="text-ink-soft">Untracked</dt>
								<dd className="text-ink-soft">
									No installer recorded this skill, so it can't be checked for
									updates.
								</dd>
							</div>
						)}
					</dl>
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
