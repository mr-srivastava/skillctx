import { Fragment } from "react";
import { ListLegend } from "@/components/presence";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { plural } from "@/lib/format";
import { type Filters, filterRows, type Row } from "@/lib/model";
import type { InventorySummary } from "../../../../core/inventory/format.ts";
import { FilterBar } from "./FilterBar.tsx";
import { Headline } from "./Headline.tsx";
import { SkillCard, SkillRow } from "./SkillItem";
import type { SkillView } from "./ViewToggle.tsx";

/** The Library: every skill, filtered and sorted, as a list or cards. */
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
	const visible = filterRows(rows, filters);
	const roots = summary.roots.filter((r) => r.present);
	const rootIds = roots.map((r) => r.id);

	return (
		<section>
			<Headline
				rows={rows}
				filters={filters}
				setStatus={(status) => setFilters((f) => ({ ...f, status }))}
			/>
			<FilterBar
				rows={rows}
				roots={roots}
				filters={filters}
				setFilters={setFilters}
				view={view}
				setView={setView}
			/>
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
							<SkillRow row={row} roots={rootIds} />
						</Fragment>
					))}
				</ItemGroup>
			) : (
				<ul
					aria-label="Skills"
					className="grid list-none grid-cols-1 gap-2.5 p-0 wide:grid-cols-2 split:grid-cols-3"
				>
					{visible.map((row) => (
						<SkillCard key={row.name} row={row} roots={rootIds} />
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
