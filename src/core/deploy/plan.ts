import path from "node:path";
import { safeName } from "../inventory/format.ts";
import {
	AGENT_IDS,
	type AgentId,
	agentLabel,
	foldersOf,
	TARGET_FOLDERS,
} from "./agents.ts";
import type { DeployMode, Deployment, EntryState } from "./record.ts";

/** One candidate agent folder and the state of this skill's entry in it. */
export interface FolderView {
	/** Folder id (a BUILTIN_ROOTS id). */
	id: string;
	/** Absolute folder path. */
	path: string;
	/** State of `<path>/<skill>`; see entryState. */
	state: EntryState;
	/** This skill's deployment in this folder, if the record has one. */
	recorded?: Deployment;
}

export interface PlanInput {
	skill: string;
	/** Content hash of the build being deployed. */
	hash: string;
	/** Agents to deploy to; empty means undeploy everywhere. */
	agents: readonly AgentId[];
	mode: DeployMode;
	/** Every folder in TARGET_FOLDERS that exists or could be created. */
	folders: readonly FolderView[];
}

export type Op =
	/** Nothing there: link or copy the build in. */
	| { kind: "create"; folder: string; entry: string }
	/** Already ours, same mode. */
	| { kind: "keep"; folder: string; entry: string }
	/** Ours in the other mode: remove and write again. */
	| { kind: "recreate"; folder: string; entry: string }
	/** A link to our build the record lost: record it. */
	| { kind: "record"; folder: string; entry: string }
	/** Another tool's symlink: replace it after confirmation, remember its target. */
	| { kind: "takeover"; folder: string; entry: string }
	/** Ours, but no longer wanted here: remove it, restoring any link we replaced. */
	| { kind: "remove"; folder: string; entry: string; restore?: string }
	/** In the record but not ours on disk any more: drop it from the record only. */
	| { kind: "forget"; folder: string; entry: string; reason: EntryState };

export interface Plan {
	skill: string;
	hash: string;
	mode: DeployMode;
	agents: readonly AgentId[];
	ops: Op[];
	/** Agents that can't be reached, with the reason for each folder they read. */
	blocked: { agent: AgentId; reasons: string[] }[];
	warnings: string[];
	/** True when applying needs the user to confirm a takeover. */
	needsConfirmation: boolean;
}

/** Folders a deployment may use: free, already ours, or a link we may take over. */
const USABLE: ReadonlySet<EntryState> = new Set([
	"missing",
	"ours",
	"ours-unrecorded",
	"foreign-link",
]);

const WHY: Record<EntryState, string> = {
	missing: "free",
	ours: "already deployed",
	"ours-unrecorded": "already linked to the build",
	"taken-back": "another tool rewrote our entry",
	"foreign-link": "another tool's link (can be replaced)",
	"foreign-folder": "another tool's folder (never replaced)",
};

function subsets<T>(items: readonly T[]): T[][] {
	const out: T[][] = [];
	for (let mask = 0; mask < 1 << items.length; mask++) {
		out.push(items.filter((_, i) => mask & (1 << i)));
	}
	return out;
}

/**
 * Work out what deploying `skill` for `agents` would write, without writing
 * anything. Picks the fewest folders that reach every reachable agent (then:
 * most already ours, fewest takeovers, fewest other agents exposed, the
 * agents' preferred folders), and removes this skill's entries from folders
 * no longer chosen. Pure: everything it knows comes from `input`.
 */
export function plan(input: PlanInput): Plan {
	const byId = new Map(input.folders.map((f) => [f.id, f]));
	const usable = (id: string) => {
		const f = byId.get(id);
		return f !== undefined && USABLE.has(f.state);
	};

	const blocked: Plan["blocked"] = [];
	const reachable: AgentId[] = [];
	for (const agent of input.agents) {
		if (foldersOf(agent).some(usable)) reachable.push(agent);
		else
			blocked.push({
				agent,
				reasons: foldersOf(agent).map((id) => {
					const f = byId.get(id);
					return f
						? `${f.path}: ${WHY[f.state]}`
						: `${id}: not available on this machine`;
				}),
			});
	}

	const candidates = TARGET_FOLDERS.filter(
		(id) => usable(id) && reachable.some((a) => foldersOf(a).includes(id)),
	);
	const unchosen = AGENT_IDS.filter((a) => !input.agents.includes(a));
	const score = (set: readonly string[]): number[] => {
		const state = (id: string) => byId.get(id)?.state;
		return [
			set.length,
			-set.filter((id) => state(id) === "ours").length,
			set.filter((id) => state(id) === "foreign-link").length,
			unchosen.filter((a) => foldersOf(a).some((id) => set.includes(id)))
				.length,
			reachable.reduce((n, a) => {
				const rank = foldersOf(a).findIndex((id) => set.includes(id));
				return n + (rank < 0 ? 0 : rank);
			}, 0),
		];
	};
	const better = (a: number[], b: number[]) => {
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return (a[i] ?? 0) < (b[i] ?? 0);
		}
		return false;
	};

	let chosen: string[] = [];
	let best: number[] | undefined;
	for (const set of subsets(candidates)) {
		const covers = reachable.every((a) =>
			foldersOf(a).some((id) => set.includes(id)),
		);
		if (!covers) continue;
		const s = score(set);
		if (!best || better(s, best)) {
			best = s;
			chosen = set;
		}
	}

	const entryIn = (f: FolderView) => path.join(f.path, safeName(input.skill));
	const ops: Op[] = [];
	for (const f of input.folders) {
		const entry = entryIn(f);
		if (chosen.includes(f.id)) {
			if (f.state === "missing")
				ops.push({ kind: "create", folder: f.path, entry });
			else if (f.state === "ours")
				ops.push({
					kind: f.recorded?.mode === input.mode ? "keep" : "recreate",
					folder: f.path,
					entry,
				});
			else if (f.state === "ours-unrecorded")
				ops.push({
					kind: input.mode === "symlink" ? "record" : "recreate",
					folder: f.path,
					entry,
				});
			else if (f.state === "foreign-link")
				ops.push({ kind: "takeover", folder: f.path, entry });
		} else if (f.recorded || f.state === "ours-unrecorded") {
			if (f.state === "ours" || f.state === "ours-unrecorded")
				ops.push({
					kind: "remove",
					folder: f.path,
					entry,
					restore: f.recorded?.replaced?.linkTarget,
				});
			else ops.push({ kind: "forget", folder: f.path, entry, reason: f.state });
		}
	}

	const warnings: string[] = [];
	// After applying: chosen folders hold ours; other tools' entries stay put;
	// our entries elsewhere are removed.
	const OTHERS: ReadonlySet<EntryState> = new Set([
		"foreign-link",
		"foreign-folder",
		"taken-back",
	]);
	const present = (f: FolderView) =>
		chosen.includes(f.id) || OTHERS.has(f.state);
	// Before applying: any entry for this skill, ours or another tool's.
	const presentNow = (f: FolderView) => f.state !== "missing";
	const exposed = unchosen.filter((a) =>
		foldersOf(a).some((id) => chosen.includes(id)),
	);
	for (const agent of [...reachable, ...exposed]) {
		const views = foldersOf(agent)
			.map((id) => byId.get(id))
			.filter((f): f is FolderView => f !== undefined);
		const seen = views.filter(present);
		if (seen.length < 2) continue;
		const paths = seen.map((f) => f.path).join(", ");
		// Say whether this deploy adds the duplicate or it was already there
		// (e.g. npx skills linking one folder into every agent's).
		warnings.push(
			seen.length > views.filter(presentNow).length
				? `${agentLabel(agent)} will see ${input.skill} ${seen.length} times: ${paths}`
				: `${agentLabel(agent)} already sees ${input.skill} ${seen.length} times; this deploy adds none: ${paths}`,
		);
	}
	if (exposed.length > 0)
		warnings.push(
			`Also visible to ${exposed.map(agentLabel).join(", ")}, which ${exposed.length === 1 ? "reads" : "read"} the same folder.`,
		);
	for (const op of ops)
		if (op.kind === "forget")
			warnings.push(
				`${op.entry}: ${WHY[op.reason]}; dropping it from the record and leaving it alone.`,
			);

	return {
		skill: input.skill,
		hash: input.hash,
		mode: input.mode,
		agents: input.agents,
		ops,
		blocked,
		warnings,
		needsConfirmation: ops.some((o) => o.kind === "takeover"),
	};
}
