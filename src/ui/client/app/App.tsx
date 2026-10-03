import { useQuery } from "@tanstack/react-query";
import { FolderSearchIcon } from "lucide-react";
import { useState } from "react";
import { BusySpinner, PageHeading } from "@/components/display";
import { Problem } from "@/components/problem";
import { Button } from "@/components/ui/button";
import { SkillDetail } from "@/features/skill-detail/SkillDetail";
import { SkillList, type SkillView } from "@/features/skill-list/SkillList";
import type { Inventory } from "@/lib/api";
import { type Filters, NO_FILTERS, toRows } from "@/lib/model";
import { inventoryQuery, useRefresh } from "@/lib/queries";
import { type Busy, TopBar } from "./TopBar.tsx";
import { useHashRoute } from "./useHashRoute.ts";

const PAGE = "mx-auto max-w-[1180px] px-4 pb-16 wide:px-8 wide:pb-24";

/**
 * The inventory plus the list rows derived from it. As a query `select`
 * defined once, it reruns only when the inventory itself changes.
 */
function withRows(inventory: Inventory) {
	return { ...inventory, rows: toRows(inventory.skills, inventory.upstream) };
}

export function App() {
	const inventory = useQuery({ ...inventoryQuery, select: withRows });
	const data = inventory.data ?? null;
	// Only a first load that fails replaces the page. A failed refetch (on
	// window focus) keeps the inventory already shown and retries next time.
	const loadError = data ? null : (inventory.error?.message ?? null);
	const refreshing = useRefresh();
	const busy: Busy = refreshing.isPending
		? refreshing.variables
			? "check"
			: "scan"
		: null;
	const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
		null,
	);
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [skillView, setSkillView] = useState<SkillView>("list");
	const [route, setTab] = useHashRoute();
	const selected = route.name;

	const refresh = (check: boolean) => {
		setResult(null);
		refreshing.mutate(check, {
			onSuccess: (r) => setResult({ ok: r.ok, text: r.message }),
			onError: (e) =>
				setResult({
					ok: false,
					text: `Couldn't reach skillctx. Check that \`skillctx ui\` is still running. (${e.message})`,
				}),
		});
	};

	const rows = data?.rows ?? [];

	const bar = (
		<TopBar
			busy={busy}
			onRefresh={refresh}
			result={result}
			upstream={data?.upstream ?? null}
		/>
	);

	if (loadError) {
		return (
			<main className={PAGE}>
				{bar}
				<Problem className="my-10" title="The inventory couldn't be loaded">
					{loadError}. Restart <code>skillctx ui</code> and reload this page.
				</Problem>
			</main>
		);
	}
	if (!data) {
		return (
			<main className={PAGE}>
				{bar}
				<p className="my-10 text-ink-soft">Loading the inventory…</p>
			</main>
		);
	}
	if (!data.summary) {
		return (
			<main className={PAGE}>
				{bar}
				<section className="max-w-[52ch] py-12">
					<PageHeading className="mb-7">No inventory yet</PageHeading>
					<p className="mb-5">
						Scan your skill folders to see every skill on this machine and where
						it lives.
					</p>
					<Button
						variant="default"
						disabled={busy !== null}
						onClick={() => refresh(false)}
					>
						{busy ? <BusySpinner /> : <FolderSearchIcon aria-hidden />}
						{busy ? "Scanning…" : "Scan now"}
					</Button>
				</section>
			</main>
		);
	}

	const skill = selected
		? data.skills.find((s) => s.name === selected)
		: undefined;

	return (
		<main className={PAGE}>
			{bar}
			{selected ? (
				skill ? (
					<SkillDetail
						skill={skill}
						row={rows.find((r) => r.name === skill.name)}
						summary={data.summary}
						tab={route.tab}
						onTab={setTab}
					/>
				) : (
					<Problem
						className="my-10"
						title={`There's no skill named “${selected}” in the inventory`}
					>
						<a href="#/">Show all skills</a>
					</Problem>
				)
			) : (
				<SkillList
					rows={rows}
					summary={data.summary}
					filters={filters}
					setFilters={setFilters}
					view={skillView}
					setView={setSkillView}
				/>
			)}
		</main>
	);
}
