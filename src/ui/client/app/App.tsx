import { useQuery } from "@tanstack/react-query";
import { FolderSearchIcon } from "lucide-react";
import { useState } from "react";
import { BusySpinner, PageHeading } from "@/components/display";
import { Problem } from "@/components/problem";
import { Button } from "@/components/ui/button";
import { SkillDetail } from "@/features/skill-detail/SkillDetail";
import { SkillList } from "@/features/skill-list/SkillList";
import type { SkillView } from "@/features/skill-list/ViewToggle";
import type { Inventory } from "@/lib/api";
import type { InventorySummary } from "@/lib/core";
import { type Filters, NO_FILTERS, toRows } from "@/lib/model";
import { inventoryQuery } from "@/lib/queries";
import { LIBRARY_HREF } from "@/lib/routes";
import { TopBar } from "./TopBar.tsx";
import { useHashRoute } from "./useHashRoute.ts";
import { type Busy, useRefreshStatus } from "./useRefreshStatus.ts";

/**
 * The inventory plus the list rows derived from it. As a query `select`
 * defined once, it reruns only when the inventory itself changes.
 */
function withRows(inventory: Inventory) {
	return { ...inventory, rows: toRows(inventory.skills, inventory.upstream) };
}

type Loaded = ReturnType<typeof withRows>;

/** The top bar on every page, and below it whichever page applies. */
export function App() {
	const inventory = useQuery({ ...inventoryQuery, select: withRows });
	const data = inventory.data ?? null;
	// Only a first load that fails replaces the page. A failed refetch (on
	// window focus) keeps the inventory already shown and retries next time.
	const loadError = data ? null : (inventory.error?.message ?? null);
	const { busy, notice, refresh } = useRefreshStatus();
	return (
		<main className="mx-auto max-w-[1180px] px-4 pb-16 wide:px-8 wide:pb-24">
			<TopBar
				busy={busy}
				onRefresh={refresh}
				notice={notice}
				upstream={data?.upstream ?? null}
			/>
			{loadError ? (
				<Problem className="my-10" title="The inventory couldn't be loaded">
					{loadError}. Restart <code>skillctx ui</code> and reload this page.
				</Problem>
			) : !data ? (
				<p className="my-10 text-ink-soft">Loading the inventory…</p>
			) : data.summary ? (
				<Pages data={data} summary={data.summary} />
			) : (
				<NoInventory busy={busy} onScan={() => refresh(false)} />
			)}
		</main>
	);
}

/** Before the first scan: what skillctx does, and a button to start. */
function NoInventory({ busy, onScan }: { busy: Busy; onScan: () => void }) {
	return (
		<section className="max-w-[52ch] py-12">
			<PageHeading className="mb-7">No inventory yet</PageHeading>
			<p className="mb-5">
				Scan your skill folders to see every skill on this machine and where it
				lives.
			</p>
			<Button variant="default" disabled={busy !== null} onClick={onScan}>
				{busy ? <BusySpinner /> : <FolderSearchIcon aria-hidden />}
				{busy ? "Scanning…" : "Scan now"}
			</Button>
		</section>
	);
}

/**
 * The Library or a skill, by the address. Filters and the list's view live
 * here, above both, so they survive a visit to a skill and back.
 */
function Pages({ data, summary }: { data: Loaded; summary: InventorySummary }) {
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [view, setView] = useState<SkillView>("list");
	const [route, setTab] = useHashRoute();

	if (route.name === null) {
		return (
			<SkillList
				rows={data.rows}
				summary={summary}
				filters={filters}
				setFilters={setFilters}
				view={view}
				setView={setView}
			/>
		);
	}
	// Rows come from the skills one for one, so a skill found has its row.
	const skill = data.skills.find((s) => s.name === route.name);
	const row = data.rows.find((r) => r.name === route.name);
	if (!skill || !row) {
		return (
			<Problem
				className="my-10"
				title={`There's no skill named “${route.name}” in the inventory`}
			>
				<a href={LIBRARY_HREF}>Show all skills</a>
			</Problem>
		);
	}
	return (
		<SkillDetail
			skill={skill}
			row={row}
			summary={summary}
			tab={route.tab}
			onTab={setTab}
		/>
	);
}
