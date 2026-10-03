import {
	type Deployment,
	type EntryState,
	entryState,
	readRecord,
} from "../deploy/record.ts";
import { buildDir } from "../library/format.ts";
import { fromPortable } from "../paths.ts";
import type { Workspace } from "../workspace.ts";

export interface DeploymentStatus extends Deployment {
	/** How the entry stands on disk now, against what the record says we wrote. */
	state: EntryState;
}

/** Every recorded deployment and its current state, in record order. */
export function listDeployments(
	ws: Workspace,
	homeDir: string,
): DeploymentStatus[] {
	return readRecord(ws).deployments.map((d) => ({
		...d,
		state: entryState(
			fromPortable(d.entry, homeDir),
			d,
			ws.resolve(buildDir(d.skill)),
		),
	}));
}
