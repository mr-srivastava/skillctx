import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { InventorySummary } from "../../core/inventory/format.ts";
import { sourceLabel } from "../../core/provenance/kinds.ts";
import { rootLabel } from "../../core/sources/roots.ts";
import {
	countBy,
	type Filters,
	filterRows,
	NO_FILTERS,
	type Presence,
	type Row,
	STATUS_LABEL,
	type Status,
} from "./model.ts";
import {
	CELL,
	Cell,
	DESC,
	HEADLINE,
	Hint,
	PRESENCE_TEXT,
	STATUS_ICON,
	STATUS_TEXT,
} from "./ui.tsx";

const ANY = "any";

function Headline({
	rows,
	filters,
	setStatus,
}: {
	rows: Row[];
	filters: Filters;
	setStatus: (s: Status | "") => void;
}) {
	const all: { status: Status; count: number; text: string }[] = [
		{
			status: "outdated",
			count: countBy(rows, "outdated"),
			text: "are outdated",
		},
		{
			status: "edited",
			count: countBy(rows, "edited"),
			text: "were edited after install",
		},
		{
			status: "drift",
			count: countBy(rows, "drift"),
			text: "have copies that differ",
		},
		{
			status: "warnings",
			count: countBy(rows, "warnings"),
			text: "have broken frontmatter",
		},
	];
	const parts = all.filter((p) => p.count > 0);

	const figure = (status: Status | "", label: string, meaning: string) => (
		<button
			type="button"
			className={cn(
				"cursor-pointer rounded px-[0.12em] font-semibold underline decoration-2 underline-offset-[0.18em] hover:decoration-current",
				status ? STATUS_TEXT[status] : "text-ink",
				status && filters.status === status
					? "bg-current/12 decoration-current"
					: "decoration-current/35",
			)}
			aria-pressed={status ? filters.status === status : undefined}
			aria-label={
				status
					? `${label} ${meaning}. ${filters.status === status ? "Showing only these; press to show all." : "Press to show only these."}`
					: `${label}. Press to show all.`
			}
			onClick={() => setStatus(filters.status === status ? "" : status)}
		>
			{label}
		</button>
	);

	return (
		<h1 className={cn(HEADLINE, "mt-7 mb-7 wide:mt-10")}>
			{figure("", `${rows.length} skills`, "")} on this machine.
			{parts.length === 0 ? (
				" Nothing needs attention."
			) : (
				<>
					{" "}
					{parts.map((p, i) => (
						<span key={p.status}>
							{i > 0 && (i === parts.length - 1 ? " and " : ", ")}
							{figure(p.status, String(p.count), p.text)} {p.text}
						</span>
					))}
					.
				</>
			)}
		</h1>
	);
}

export function SkillList({
	rows,
	summary,
	filters,
	setFilters,
}: {
	rows: Row[];
	summary: InventorySummary;
	filters: Filters;
	setFilters: (f: Filters | ((f: Filters) => Filters)) => void;
}) {
	const search = useRef<HTMLInputElement>(null);
	const set = (patch: Partial<Filters>) =>
		setFilters((f) => ({ ...f, ...patch }));
	const visible = filterRows(rows, filters);
	const roots = summary.roots.filter((r) => r.present);
	const sources = [...new Set(rows.flatMap((r) => r.sources))].sort();

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const typing =
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLSelectElement;
			if (e.key === "/" && !typing) {
				e.preventDefault();
				search.current?.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const filtered = Boolean(
		filters.query || filters.source || filters.root || filters.status,
	);

	return (
		<section>
			<Headline
				rows={rows}
				filters={filters}
				setStatus={(status) => set({ status })}
			/>

			<div className="mb-3.5 flex flex-wrap items-center gap-2">
				<InputGroup className="w-auto max-w-[420px] flex-[1_1_260px]">
					<InputGroupAddon align="inline-start">
						<SearchIcon aria-hidden />
					</InputGroupAddon>
					<InputGroupInput
						ref={search}
						type="search"
						placeholder="Find a skill"
						value={filters.query}
						onChange={(e) => set({ query: e.target.value })}
						aria-label="Find a skill by name or description"
						aria-keyshortcuts="/"
					/>
					{/* The shortcut is useless without a keyboard; hide it on phones. */}
					<InputGroupAddon align="inline-end" className="hidden wide:flex">
						<Kbd>/</Kbd>
					</InputGroupAddon>
				</InputGroup>
				<Select
					// Radix Select can't use "" as an item value; ANY stands for no filter.
					value={filters.source || ANY}
					onValueChange={(v) => set({ source: v === ANY ? "" : v })}
				>
					<SelectTrigger aria-label="Installed by">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ANY}>Installed by anything</SelectItem>
						{sources.map((s) => (
							<SelectItem key={s} value={s}>
								{sourceLabel(s)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={filters.sort}
					onValueChange={(v) => set({ sort: v as Filters["sort"] })}
				>
					<SelectTrigger aria-label="Sort">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="attention">Needs attention first</SelectItem>
						<SelectItem value="name">A to Z</SelectItem>
					</SelectContent>
				</Select>
				{filtered && (
					<Button
						variant="link"
						size="inline"
						className="gap-1"
						onClick={() => setFilters({ ...NO_FILTERS, sort: filters.sort })}
					>
						<XIcon aria-hidden className="size-3.5" />
						Clear filters
					</Button>
				)}
			</div>

			<Legend />

			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr>
							<th scope="col" className={cn(CELL.headSkill, "w-[46%]")}>
								{visible.length === rows.length
									? "Skill"
									: `${visible.length} of ${rows.length} skills`}
							</th>
							{roots.map((r) => (
								<th key={r.id} scope="col" className={CELL.headLoc}>
									<Hint
										text={`${r.path} holds ${r.entries} skills. ${filters.root === r.id ? "Showing only these; press to show all." : "Press to show only these."}`}
									>
										<button
											type="button"
											className={cn(
												"cursor-pointer rounded px-1 py-0.5 hover:text-ink",
												filters.root === r.id &&
													"bg-raised text-ink shadow-[inset_0_-2px_0_var(--ink)]",
											)}
											aria-pressed={filters.root === r.id}
											onClick={() =>
												set({ root: filters.root === r.id ? "" : r.id })
											}
										>
											{rootLabel(r.id)}
										</button>
									</Hint>
								</th>
							))}
							<th scope="col" className={CELL.headState}>
								State
							</th>
						</tr>
					</thead>
					<tbody>
						{visible.map((r) => (
							<tr key={r.name} className="hover:bg-raised">
								<th scope="row" className={cn(CELL.bodySkill, "w-[46%]")}>
									<a
										className="font-mono text-small font-semibold no-underline hover:underline"
										href={`#/skill/${encodeURIComponent(r.name)}`}
									>
										{r.name}
									</a>
									<span className={DESC}>{r.description}</span>
								</th>
								{roots.map((root) => (
									<td key={root.id} className={CELL.bodyLoc}>
										<Cell
											presence={r.presence[root.id] ?? "absent"}
											root={root.id}
										/>
									</td>
								))}
								<td className={CELL.bodyState}>
									{r.statuses.map((s) => {
										const Icon = STATUS_ICON[s];
										return (
											<span
												key={s}
												className={cn(
													"flex items-center gap-1.5 text-caption font-medium whitespace-nowrap",
													STATUS_TEXT[s],
												)}
											>
												<Icon aria-hidden className="size-3.5 shrink-0" />
												{STATUS_LABEL[s]}
											</span>
										);
									})}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{visible.length === 0 && (
				<p className="my-4 text-ink-soft">
					No skills match. Try a shorter search, or clear the filters.
				</p>
			)}
		</section>
	);
}

function Legend() {
	const kinds: Presence[] = ["folder", "link", "differs", "absent"];
	return (
		<p className="mb-2 flex flex-wrap gap-x-5 gap-y-1.5 text-caption text-ink-soft">
			{kinds.map((k) => (
				<span key={k} className="inline-flex items-center gap-1.75">
					<Cell presence={k} /> {PRESENCE_TEXT[k].toLowerCase()}
				</span>
			))}
		</p>
	);
}
