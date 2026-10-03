import { type ApplyOptions, applyPlan, planDeploy } from "../deploy/apply.ts";
import type { Op, Plan } from "../deploy/plan.ts";
import {
	type Deployment,
	type EntryState,
	entryState,
	readRecord,
} from "../deploy/record.ts";
import { buildDir } from "../library/format.ts";
import { withWorkspaceLock } from "../lock.ts";
import { fromPortable, toPortable } from "../paths.ts";
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

/** A plan as shown to a person: every path under home as a `~/` path. */
export function displayPlan(p: Plan, homeDir: string): Plan {
	const show = (abs: string) => toPortable(abs, homeDir);
	const text = (s: string) => s.replaceAll(homeDir, "~");
	return {
		...p,
		ops: p.ops.map((op) => ({
			...op,
			folder: show(op.folder),
			entry: show(op.entry),
			...(op.kind === "remove" && op.restore
				? { restore: show(op.restore) }
				: {}),
		})),
		blocked: p.blocked.map((b) => ({ ...b, reasons: b.reasons.map(text) })),
		warnings: p.warnings.map(text),
	};
}

export type ReviewedOutcome =
	| { status: "applied"; plan: Plan; applied: Op[] }
	/** The disk changed since the plan was shown; nothing was written. */
	| { status: "changed"; plan: Plan };

/** What a person approves when they confirm a plan. */
function approved(p: Plan): string {
	const { ops, blocked, warnings, needsConfirmation, hash } = p;
	return JSON.stringify({ ops, blocked, warnings, needsConfirmation, hash });
}

/**
 * Apply a plan someone reviewed, possibly minutes ago (the UI's confirm
 * step). Plans again under the workspace lock and applies only if the new
 * plan is the one they saw, as displayPlan showed it; otherwise returns the
 * new plan to show instead. The reviewed plan only says what was agreed to:
 * what gets written always comes from the fresh plan.
 */
export function applyReviewed(
	ws: Workspace,
	homeDir: string,
	reviewed: Plan,
	opts: ApplyOptions,
): ReviewedOutcome {
	return withWorkspaceLock(ws, () => {
		const fresh = planDeploy(ws, homeDir, {
			skill: reviewed.skill,
			agents: reviewed.agents,
			mode: reviewed.mode,
		});
		const shown = displayPlan(fresh, homeDir);
		if (approved(shown) !== approved(reviewed))
			return { status: "changed", plan: shown };
		const { applied } = applyPlan(ws, homeDir, fresh, opts);
		return { status: "applied", plan: shown, applied };
	});
}
