import { withWorkspaceLock } from "../lock.ts";
import {
	checkUpstream,
	type UpstreamDeps,
	type UpstreamReport,
} from "../upstream/index.ts";
import type { Workspace } from "../workspace.ts";
import { type ScanResult, scan } from "./scan.ts";
import { type WriteResult, writeInventory, writeUpstream } from "./store.ts";

export interface RefreshOptions {
	/** Also compare with upstream (network). Off unless asked for (ADR-010). */
	check: boolean;
	/** Called only when `check` is set, so a plain scan never looks up a token. */
	upstream: () => UpstreamDeps;
	/** Called after the inventory is written, before any network access. */
	onScanned?: (scan: ScanResult, written: WriteResult) => void;
}

export interface RefreshOutcome {
	scan: ScanResult;
	written: WriteResult;
	/** Present only when `check` was set. */
	upstream?: UpstreamReport;
}

/**
 * Scan every skill root, write the inventory, and optionally check upstream
 * and write that too. The one operation behind `inventory [--check]`, the
 * UI's refresh buttons, and later MCP.
 */
export async function refreshInventory(
	ws: Workspace,
	homeDir: string,
	opts: RefreshOptions,
): Promise<RefreshOutcome> {
	const { result, written } = withWorkspaceLock(ws, () => {
		const scanned = scan(ws, homeDir);
		return { result: scanned, written: writeInventory(ws, scanned, homeDir) };
	});
	opts.onScanned?.(result, written);
	if (!opts.check) return { scan: result, written };
	const report = await checkUpstream(result.skills, {
		...opts.upstream(),
		homeDir,
	});
	withWorkspaceLock(ws, () => writeUpstream(ws, report));
	return { scan: result, written, upstream: report };
}
