import {
	CircleArrowUpIcon,
	GitCompareIcon,
	type LucideIcon,
	PencilIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { Row, Status } from "@/lib/model";
import { cn } from "@/lib/utils";

interface StatusLook {
	/** On pills and in list rows; lowercased on the Library's filter chips. */
	label: string;
	/** Completes "3 skills …" (many) or "1 skill …" (one). */
	phrase: { one: string; many: string };
	icon: LucideIcon;
	/** Text colour class; pills tint their background from it. */
	tone: string;
}

/** How each status reads and looks, everywhere it's shown. */
export const STATUS: Record<Status, StatusLook> = {
	outdated: {
		label: "Outdated",
		phrase: { one: "is outdated", many: "are outdated" },
		icon: CircleArrowUpIcon,
		tone: "text-outdated",
	},
	edited: {
		label: "Edited",
		phrase: {
			one: "was edited after install",
			many: "were edited after install",
		},
		icon: PencilIcon,
		tone: "text-edited",
	},
	drift: {
		label: "Copies differ",
		phrase: { one: "has copies that differ", many: "have copies that differ" },
		icon: GitCompareIcon,
		tone: "text-differs",
	},
	warnings: {
		label: "Warnings",
		phrase: { one: "has broken frontmatter", many: "have broken frontmatter" },
		icon: TriangleAlertIcon,
		tone: "text-problem",
	},
};

/**
 * A skill's states, coloured by status. `compact` draws them as pills (cards
 * and the skill page header); otherwise they stack in a fixed-width column so
 * list rows line up.
 */
export function SkillStatuses({
	row,
	compact = false,
}: {
	row: Row;
	compact?: boolean;
}) {
	// In list rows the column keeps its width when empty, so logos line up.
	if (compact && row.statuses.length === 0) return null;
	return (
		<div
			className={cn(
				"flex gap-1",
				compact
					? "flex-wrap justify-end"
					: "min-w-[130px] flex-col wide:w-[130px]",
			)}
		>
			{row.statuses.map((status) => {
				const { icon: Icon, tone, label } = STATUS[status];
				return (
					<span
						key={status}
						className={cn(
							"flex items-center gap-1.5 text-caption font-medium whitespace-nowrap",
							tone,
							compact && "rounded-full bg-current/10 px-2 py-0.5 text-chip",
						)}
					>
						<Icon aria-hidden className="size-3.5 shrink-0" />
						{label}
					</span>
				);
			})}
		</div>
	);
}
