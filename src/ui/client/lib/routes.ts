/*
 * The page's addresses, both ways: links are built and the hash is read
 * here, so the two can't drift apart. `#/` is the Library; `#/skill/<name>`
 * opens a skill on Contents, and `#/skill/<name>/<tab>` on another tab.
 */

export const DETAIL_TABS = ["contents", "where", "copies"] as const;

export type DetailTab = (typeof DETAIL_TABS)[number];

export interface Route {
	/** The skill shown, or null for the Library. */
	name: string | null;
	tab: DetailTab;
}

export const LIBRARY_HREF = "#/";

export function skillHref(name: string, tab: DetailTab = "contents"): string {
	const base = `#/skill/${encodeURIComponent(name)}`;
	return tab === "contents" ? base : `${base}/${tab}`;
}

/** The route for a location hash; anything unrecognised is the Library. */
export function parseHash(hash: string): Route {
	const match = /^#\/skill\/([^/]+)(?:\/([a-z]+))?$/.exec(hash);
	const tab = DETAIL_TABS.find((t) => t === match?.[2]) ?? "contents";
	let name: string | null = null;
	try {
		name = match?.[1] ? decodeURIComponent(match[1]) : null;
	} catch {
		// A malformed escape (#/skill/%E0) names no skill.
	}
	return { name, tab };
}
