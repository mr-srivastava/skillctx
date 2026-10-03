import { CircleCheckIcon } from "lucide-react";
import { PageHeading } from "@/components/display";
import { STATUS } from "@/components/status";
import { plural } from "@/lib/format";
import {
	countBy,
	type Filters,
	type Row,
	STATUSES,
	type Status,
} from "@/lib/model";
import { cn } from "@/lib/utils";

/**
 * The Library's title and skill count, and a chip per status that needs
 * attention. A chip filters the list to that status; pressed again, it clears.
 */
export function Headline({
	rows,
	filters,
	setStatus,
}: {
	rows: Row[];
	filters: Filters;
	setStatus: (s: Status | "") => void;
}) {
	const parts = STATUSES.map((status) => ({
		status,
		count: countBy(rows, status),
	})).filter((p) => p.count > 0);

	return (
		<div className="mt-7 mb-5 wide:mt-9">
			<div className="flex items-center gap-3">
				<PageHeading>Library</PageHeading>
				<span className="rounded-full border border-rule bg-raised px-2.5 py-0.5 text-caption font-medium tabular-nums text-ink-soft">
					<span aria-hidden>{rows.length}</span>
					<span className="sr-only">{plural(rows.length, "skill")}</span>
				</span>
			</div>
			<p className="mt-1 text-caption text-ink-soft">
				Skills across your agent locations
			</p>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				{parts.length === 0 ? (
					<p className="inline-flex items-center gap-1.5 text-caption text-ink-soft">
						<CircleCheckIcon aria-hidden className="size-3.5" />
						No issues need attention
					</p>
				) : (
					<>
						<span className="mr-1 text-caption text-ink-soft">
							Needs attention
						</span>
						{parts.map((part) => {
							const { icon: Icon, tone, label, phrase } = STATUS[part.status];
							const selected = filters.status === part.status;
							const says = `${plural(part.count, "skill")} ${part.count === 1 ? phrase.one : phrase.many}.`;
							return (
								<button
									key={part.status}
									type="button"
									className={cn(
										"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
										tone,
										selected
											? "border-current bg-current/10"
											: "border-rule bg-transparent",
									)}
									aria-pressed={selected}
									aria-label={`${says} ${selected ? "Showing only these; press to show all." : "Press to show only these."}`}
									onClick={() => setStatus(selected ? "" : part.status)}
								>
									<Icon aria-hidden className="size-3.5" />
									<span className="tabular-nums">{part.count}</span>
									<span>{label.toLowerCase()}</span>
								</button>
							);
						})}
					</>
				)}
			</div>
		</div>
	);
}
