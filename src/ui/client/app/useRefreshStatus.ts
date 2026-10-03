import { useState } from "react";
import { useRefresh } from "@/lib/queries";

/** What's running: a rescan, a rescan plus update check, or nothing. */
export type Busy = null | "scan" | "check";

/** The outcome of the last refresh, shown under the top bar. */
export interface RefreshNotice {
	ok: boolean;
	text: string;
}

/**
 * Rescanning and checking for updates, as the page shows them: what's
 * running, and how the last one went. `refresh(true)` also checks upstream.
 */
export function useRefreshStatus(): {
	busy: Busy;
	notice: RefreshNotice | null;
	refresh: (check: boolean) => void;
} {
	const refreshing = useRefresh();
	const [notice, setNotice] = useState<RefreshNotice | null>(null);
	const busy: Busy = refreshing.isPending
		? refreshing.variables
			? "check"
			: "scan"
		: null;

	const refresh = (check: boolean) => {
		setNotice(null);
		refreshing.mutate(check, {
			onSuccess: (r) => setNotice({ ok: r.ok, text: r.message }),
			onError: (e) =>
				setNotice({
					ok: false,
					text: `Couldn't reach skillctx. Check that \`skillctx ui\` is still running. (${e.message})`,
				}),
		});
	};
	return { busy, notice, refresh };
}
