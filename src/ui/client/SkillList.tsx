import { SearchIcon, XIcon } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemSeparator,
	ItemTitle,
} from "@/components/ui/item";
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
	type Row,
	STATUS_LABEL,
	type Status,
} from "./model.ts";
import {
	DiffersDot,
	HEADLINE,
	LocationIcons,
	rootIcon,
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
					value={filters.root || ANY}
					onValueChange={(v) => set({ root: v === ANY ? "" : v })}
				>
					<SelectTrigger aria-label="Location">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ANY}>In any location</SelectItem>
						{roots.map((r) => {
							const Logo = rootIcon(r.id);
							return (
								<SelectItem key={r.id} value={r.id}>
									<Logo aria-hidden />
									In {rootLabel(r.id)} ({r.entries})
								</SelectItem>
							);
						})}
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

			<Legend
				count={
					visible.length === rows.length
						? `${rows.length} skills`
						: `${visible.length} of ${rows.length} skills`
				}
			/>

			<ItemGroup aria-label="Skills">
				{visible.map((r, i) => (
					<Fragment key={r.name}>
						{i > 0 && <ItemSeparator />}
						<SkillItem row={r} roots={roots.map((root) => root.id)} />
					</Fragment>
				))}
			</ItemGroup>
			{visible.length === 0 && (
				<p className="my-4 text-ink-soft">
					No skills match. Try a shorter search, or clear the filters.
				</p>
			)}
		</section>
	);
}

/**
 * One skill: name and description, the logos of the locations it is in,
 * and its states.
 * The name link stretches over the whole item, so the item is the click
 * target while screen readers hear only the name as the link.
 */
function SkillItem({ row, roots }: { row: Row; roots: string[] }) {
	return (
		<Item role="listitem" size="sm" className="relative px-2 hover:bg-raised">
			<ItemContent className="min-w-0 basis-[260px]">
				<ItemTitle>
					<a
						className="font-mono text-small font-semibold no-underline after:absolute after:inset-0 hover:underline"
						href={`#/skill/${encodeURIComponent(row.name)}`}
					>
						{row.name}
					</a>
				</ItemTitle>
				<ItemDescription className="max-w-[72ch]">
					{row.description}
				</ItemDescription>
			</ItemContent>
			<ItemActions className="gap-6 self-start wide:pt-0.5">
				<div className="wide:w-[124px]">
					<LocationIcons presence={row.presence} roots={roots} />
				</div>
				<div className="flex flex-col gap-1 wide:w-[130px]">
					{row.statuses.map((s) => {
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
				</div>
			</ItemActions>
		</Item>
	);
}

function Legend({ count }: { count: string }) {
	return (
		<p className="mb-1 flex flex-wrap gap-x-5 gap-y-1.5 border-b border-ink pb-2 text-caption text-ink-soft">
			<span className="font-medium">{count}</span>
			<span className="inline-flex items-center gap-1.75">
				<DiffersDot /> copy with different content
			</span>
		</p>
	);
}
