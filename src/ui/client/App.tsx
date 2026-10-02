import { FolderSearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as api from "./api.ts";
import { BusySpinner, HEADLINE } from "./display.tsx";
import { type Filters, NO_FILTERS, toRows } from "./model.ts";
import { Problem } from "./problem.tsx";
import { type DetailTab, SkillDetail } from "./SkillDetail.tsx";
import { SkillList } from "./SkillList.tsx";
import { type Busy, TopBar } from "./TopBar.tsx";

const PAGE = "mx-auto max-w-[1180px] px-4 pb-16 wide:px-8 wide:pb-24";

interface Route {
	/** The skill shown, or null for the list. */
	name: string | null;
	tab: DetailTab;
}

const TABS: readonly DetailTab[] = ["contents", "where", "copies"];

/** `#/skill/<name>` opens Contents; `#/skill/<name>/<tab>` opens a tab. */
function readHash(): Route {
	const m = /^#\/skill\/([^/]+)(?:\/([a-z]+))?$/.exec(window.location.hash);
	const tab = TABS.find((t) => t === m?.[2]) ?? "contents";
	return { name: m?.[1] ? decodeURIComponent(m[1]) : null, tab };
}

function useHashRoute(): [Route, (tab: DetailTab) => void] {
	const [route, setRoute] = useState(readHash);
	useEffect(() => {
		const onChange = () => {
			setRoute(readHash());
			window.scrollTo(0, 0);
		};
		window.addEventListener("hashchange", onChange);
		return () => window.removeEventListener("hashchange", onChange);
	}, []);
	// Switching tabs replaces the URL so Back still returns to the list.
	const setTab = (tab: DetailTab) => {
		if (!route.name) return;
		const base = `#/skill/${encodeURIComponent(route.name)}`;
		history.replaceState(
			null,
			"",
			tab === "contents" ? base : `${base}/${tab}`,
		);
		setRoute({ ...route, tab });
	};
	return [route, setTab];
}

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
