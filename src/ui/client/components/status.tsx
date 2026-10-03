import { STATUS_ICON, STATUS_TEXT } from "@/components/display";
import { type Row, STATUS_LABEL } from "@/lib/model";
import { cn } from "@/lib/utils";

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
				const Icon = STATUS_ICON[status];
				return (
					<span
						key={status}
						className={cn(
							"flex items-center gap-1.5 text-caption font-medium whitespace-nowrap",
							STATUS_TEXT[status],
							compact && "rounded-full bg-current/10 px-2 py-0.5 text-chip",
						)}
					>
						<Icon aria-hidden className="size-3.5 shrink-0" />
						{STATUS_LABEL[status]}
					</span>
				);
			})}
		</div>
	);
}
