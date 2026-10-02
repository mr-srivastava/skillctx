import { useEffect, useState } from "react";
import type { DetailTab } from "@/features/skill-detail/SkillDetail";

interface Route {
	/** The skill shown, or null for the list. */
	name: string | null;
	tab: DetailTab;
}

const TABS: readonly DetailTab[] = ["contents", "where", "copies"];

/** `#/skill/<name>` opens Contents; `#/skill/<name>/<tab>` opens a tab. */
function readHash(): Route {
	const match = /^#\/skill\/([^/]+)(?:\/([a-z]+))?$/.exec(window.location.hash);
	const tab = TABS.find((candidate) => candidate === match?.[2]) ?? "contents";
	return {
		name: match?.[1] ? decodeURIComponent(match[1]) : null,
		tab,
	};
}

export function useHashRoute(): [Route, (tab: DetailTab) => void] {
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
