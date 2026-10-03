import { buildDir } from "../library/format.ts";
import { readLockfile } from "../library/store.ts";
import { listDeployments } from "../ops/deployments.ts";
import { fromPortable, tryRealpath } from "../paths.ts";
import type { ProvenanceLookup } from "../provenance/sources.ts";
import type { Workspace } from "../workspace.ts";
import { readRecord } from "./record.ts";

/**
 * Marks copies that are skillctx's own deployments: build folders that agent
 * folders link to, and copy-mode entries in the deployment record. Without
 * it a deployed skill would read as an untracked copy.
 */
export function skillctxLookup(
	ws: Workspace,
	homeDir: string,
): ProvenanceLookup {
	const byReal = new Map<string, { skill: string; mode: "symlink" | "copy" }>();
	for (const name of Object.keys(readLockfile(ws).skills)) {
		const build = tryRealpath(ws.resolve(buildDir(name)));
		if (build) byReal.set(build, { skill: name, mode: "symlink" });
	}
	for (const d of readRecord(ws).deployments) {
		if (d.mode !== "copy") continue;
		const entry = tryRealpath(fromPortable(d.entry, homeDir));
		if (entry) byReal.set(entry, { skill: d.skill, mode: "copy" });
	}
	return (realPath) => {
		const hit = byReal.get(realPath);
		return hit ? [{ kind: "skillctx", ...hit }] : [];
	};
}

export interface DeploymentTally {
	deployed: number;
	takenBack: number;
	missing: number;
}

/** How the recorded deployments stand on disk; undefined when nothing is deployed. */
export function tallyDeployments(
	ws: Workspace,
	homeDir: string,
): DeploymentTally | undefined {
	const deployments = listDeployments(ws, homeDir);
	if (deployments.length === 0) return undefined;
	const tally: DeploymentTally = { deployed: 0, takenBack: 0, missing: 0 };
	for (const { state } of deployments) {
		if (state === "ours") tally.deployed++;
		else if (state === "missing") tally.missing++;
		else tally.takenBack++;
	}
	return tally;
}
