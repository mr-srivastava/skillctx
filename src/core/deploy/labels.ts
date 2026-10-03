import type { Op } from "./plan.ts";
import type { EntryState } from "./record.ts";

/*
 * How plans and deployments read, shared by the CLI and the UI. Type-only
 * imports, so the browser can load it.
 */

/** One verb per plan operation. */
export const OP_VERB: Record<Op["kind"], string> = {
	create: "create",
	keep: "keep",
	recreate: "rewrite",
	record: "record",
	takeover: "replace",
	remove: "remove",
	forget: "forget",
};

/** A recorded deployment's state in words; the other states read as their name. */
export function deploymentStateText(state: EntryState): string {
	switch (state) {
		case "ours":
			return "deployed";
		case "taken-back":
			return "taken back by another tool";
		case "missing":
			return "missing (removed outside skillctx)";
		default:
			return state;
	}
}
