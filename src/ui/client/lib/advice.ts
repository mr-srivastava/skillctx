import type { SkillRecord } from "../../../core/inventory/format.ts";
import { updateCommand } from "../../../core/provenance/kinds.ts";
import type { Row, Status } from "./model.ts";

/** One thing to tell the reader about a skill, and what to run if anything. */
export interface Advice {
	key: string;
	/** Which status it's about, or "error" when a check failed. */
	kind: Status | "error";
	text: string;
	command?: string;
}

function shortRepo(url: string): string {
	return url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
}

/**
 * What the skill page says to do: updates with the command to run, checks
 * that failed, and what edits and differing copies mean. Empty when there's
 * nothing to do.
 */
export function adviceFor(
	skill: Pick<SkillRecord, "name" | "drift">,
	row: Row,
): Advice[] {
	const items: Advice[] = [];
	for (const u of row.upstream) {
		const command =
			u.status === "outdated"
				? updateCommand(u.via, skill.name, u.copy)
				: undefined;
		if (command) {
			items.push({
				key: `up-${u.copy}-${u.via}`,
				kind: "outdated",
				text: `${shortRepo(u.repo)} has a newer version. To update:`,
				command,
			});
		}
		if (u.status === "error") {
			items.push({
				key: `err-${u.copy}`,
				kind: "error",
				text: `Couldn't check for updates: ${u.error}`,
			});
		}
	}
	const edited = row.statuses.includes("edited");
	if (edited && row.statuses.includes("outdated")) {
		items.push({
			key: "edited-outdated",
			kind: "edited",
			text: "You edited this skill after installing it. Updating replaces those edits, so save anything you want to keep first.",
		});
	} else if (edited) {
		items.push({
			key: "edited",
			kind: "edited",
			text: "You edited this skill after installing it. The next update will replace those edits.",
		});
	}
	if (skill.drift) {
		items.push({
			key: "drift",
			kind: "drift",
			text: "Agents reading different locations see different versions of this skill. Compare copies shows what differs.",
		});
	}
	return items;
}
