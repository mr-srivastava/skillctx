import { useEffect, useState } from "react";
import { type DetailTab, parseHash, type Route, skillHref } from "@/lib/routes";

const readHash = () => parseHash(window.location.hash);

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
		history.replaceState(null, "", skillHref(route.name, tab));
		setRoute({ ...route, tab });
	};
	return [route, setTab];
}
