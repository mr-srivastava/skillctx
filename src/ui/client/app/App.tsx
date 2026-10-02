import { FolderSearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BusySpinner, HEADLINE } from "@/components/display";
import { Problem } from "@/components/problem";
import { Button } from "@/components/ui/button";
import { SkillDetail } from "@/features/skill-detail/SkillDetail";
import { SkillList } from "@/features/skill-list/SkillList";
import * as api from "@/lib/api";
import { type Filters, NO_FILTERS, toRows } from "@/lib/model";
import { cn } from "@/lib/utils";
import { type Busy, TopBar } from "./TopBar.tsx";
import { useHashRoute } from "./useHashRoute.ts";

const PAGE = "mx-auto max-w-[1180px] px-4 pb-16 wide:px-8 wide:pb-24";

export function App() {
	const [data, setData] = useState<api.Inventory | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [busy, setBusy] = useState<Busy>(null);
	const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
		null,
	);
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [route, setTab] = useHashRoute();
	const selected = route.name;

	const load = useCallback(async () => {
		try {
			setData(await api.loadInventory());
			setLoadError(null);
		} catch (e) {
			setLoadError((e as Error).message);
		}
	}, []);

	useEffect(() => {
		// oxlint-disable-next-line react/set-state-in-effect -- load() sets state after its fetches resolve, not synchronously.
		void load();
	}, [load]);

	const refresh = async (check: boolean) => {
		setBusy(check ? "check" : "scan");
		setResult(null);
		try {
			const r = await api.refresh(check);
			setResult({ ok: r.ok, text: r.message });
			await load();
		} catch (e) {
			setResult({
				ok: false,
				text: `Couldn't reach skillctx. Check that \`skillctx ui\` is still running. (${(e as Error).message})`,
			});
		} finally {
			setBusy(null);
		}
	};

	const rows = useMemo(
		() => (data ? toRows(data.skills, data.upstream) : []),
		[data],
	);

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
					<h1 className={cn(HEADLINE, "mb-7")}>No inventory yet</h1>
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
				/>
			)}
		</main>
	);
}
