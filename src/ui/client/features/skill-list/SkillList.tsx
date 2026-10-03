import {
	CircleCheckIcon,
	LayoutGridIcon,
	ListIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { PageHeading, Toolbar } from "@/components/display";
import { type PickerItem, Picker } from "@/components/picker";
import { ListLegend, rootIcon } from "@/components/presence";
import { STATUS } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
import { plural } from "@/lib/format";
import {
	countBy,
	type Filters,
	filterRows,
	NO_FILTERS,
	type Row,
	STATUSES,
	type Status,
} from "@/lib/model";
import { cn } from "@/lib/utils";
import type { InventorySummary } from "../../../../core/inventory/format.ts";
import { sourceLabel } from "../../../../core/provenance/kinds.ts";
import { rootLabel } from "../../../../core/sources/roots.ts";
import { SkillCard, SkillRow } from "./SkillItem";

export type SkillView = "list" | "grid";

function Headline({
	rows,
	filters,
	setStatus,
}: {
	rows: Row[];
	filters: Filters;
	setStatus: (s: Status | "") => void;
}) {
	const parts = STATUSES.map((status) => ({
		status,
		count: countBy(rows, status),
	})).filter((p) => p.count > 0);

	return (
		<div className="mt-7 mb-5 wide:mt-9">
			<div className="flex items-center gap-3">
				<PageHeading>Library</PageHeading>
				<span className="rounded-full border border-rule bg-raised px-2.5 py-0.5 text-caption font-medium tabular-nums text-ink-soft">
					<span aria-hidden>{rows.length}</span>
					<span className="sr-only">{plural(rows.length, "skill")}</span>
				</span>
			</div>
			<p className="mt-1 text-caption text-ink-soft">
				Skills across your agent locations
			</p>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				{parts.length === 0 ? (
					<p className="inline-flex items-center gap-1.5 text-caption text-ink-soft">
						<CircleCheckIcon aria-hidden className="size-3.5" />
						No issues need attention
					</p>
				) : (
					<>
						<span className="mr-1 text-caption text-ink-soft">
							Needs attention
						</span>
						{parts.map((part) => {
							const { icon: Icon, tone, label, phrase } = STATUS[part.status];
							const selected = filters.status === part.status;
							const says = `${plural(part.count, "skill")} ${part.count === 1 ? phrase.one : phrase.many}.`;
							return (
								<button
									key={part.status}
									type="button"
									className={cn(
										"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
										tone,
										selected
											? "border-current bg-current/10"
											: "border-rule bg-transparent",
									)}
									aria-pressed={selected}
									aria-label={`${says} ${selected ? "Showing only these; press to show all." : "Press to show only these."}`}
									onClick={() => setStatus(selected ? "" : part.status)}
								>
									<Icon aria-hidden className="size-3.5" />
									<span className="tabular-nums">{part.count}</span>
									<span>{label.toLowerCase()}</span>
								</button>
							);
						})}
					</>
				)}
			</div>
		</div>
	);
}

export function SkillList({
	rows,
	summary,
	filters,
	setFilters,
	view,
	setView,
}: {
	rows: Row[];
	summary: InventorySummary;
	filters: Filters;
	setFilters: (f: Filters | ((f: Filters) => Filters)) => void;
	view: SkillView;
	setView: (view: SkillView) => void;
}) {
	const search = useRef<HTMLInputElement>(null);
	const set = (patch: Partial<Filters>) =>
		setFilters((f) => ({ ...f, ...patch }));
	const visible = filterRows(rows, filters);
	const roots = summary.roots.filter((r) => r.present);
	const sources = [...new Set(rows.flatMap((r) => r.sources))].sort();

	// "" is the no-filter value, as in Filters.
	const sourceItems: PickerItem<string>[] = [
		{ value: "", label: "Installed by anything" },
		...sources.map((s) => ({ value: s, label: sourceLabel(s) })),
	];
	const rootItems: PickerItem<string>[] = [
		{ value: "", label: "In any location" },
		...roots.map((r) => {
			const Logo = rootIcon(r.id);
			return {
				value: r.id,
				label: (
					<>
						<Logo aria-hidden />
						In {rootLabel(r.id)} ({r.entries})
					</>
				),
			};
		}),
	];
	const sortItems: PickerItem<Filters["sort"]>[] = [
		{ value: "attention", label: "Needs attention first" },
		{ value: "name", label: "A to Z" },
	];

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

			<Toolbar className="mb-4">
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
				<Picker
					items={sourceItems}
					value={filters.source}
					onChange={(source) => set({ source })}
					label="Installed by"
					shrink
				/>
				<Picker
					items={rootItems}
					value={filters.root}
					onChange={(root) => set({ root })}
					label="Location"
					shrink
				/>
				<Picker
					items={sortItems}
					value={filters.sort}
					onChange={(sort) => set({ sort })}
					label="Sort"
					shrink
				/>
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
				<div
					className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md border border-rule bg-paper p-0.5"
					role="group"
					aria-label="Skill view"
				>
					<Button
						variant="ghost"
						size="icon-xs"
						className={cn(
							"size-8",
							view === "grid" &&
								"bg-ink text-paper hover:bg-ink/90 hover:text-paper",
						)}
						aria-label="Card view"
						title="Card view"
						aria-pressed={view === "grid"}
						onClick={() => setView("grid")}
					>
						<LayoutGridIcon aria-hidden />
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						className={cn(
							"size-8",
							view === "list" &&
								"bg-ink text-paper hover:bg-ink/90 hover:text-paper",
						)}
						aria-label="List view"
						title="List view"
						aria-pressed={view === "list"}
						onClick={() => setView("list")}
					>
						<ListIcon aria-hidden />
					</Button>
				</div>
			</Toolbar>

			<ListLegend
				count={
					visible.length === rows.length
						? plural(rows.length, "skill")
						: `${visible.length} of ${plural(rows.length, "skill")}`
				}
			/>

			{view === "list" ? (
				<ItemGroup aria-label="Skills">
					{visible.map((row, index) => (
						<Fragment key={row.name}>
							{index > 0 && <ItemSeparator />}
							<SkillRow row={row} roots={roots.map((root) => root.id)} />
						</Fragment>
					))}
				</ItemGroup>
			) : (
				<ul
					aria-label="Skills"
					className="grid list-none grid-cols-1 gap-2.5 p-0 wide:grid-cols-2 split:grid-cols-3"
				>
					{visible.map((row) => (
						<SkillCard
							key={row.name}
							row={row}
							roots={roots.map((root) => root.id)}
						/>
					))}
				</ul>
			)}
			{visible.length === 0 && (
				<p className="my-4 text-ink-soft" role="status" aria-live="polite">
					No skills match. Try a shorter search, or clear the filters.
				</p>
			)}
		</section>
	);
}
