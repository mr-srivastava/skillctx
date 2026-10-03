import { LocationIcons } from "@/components/presence";
import { SkillStatuses } from "@/components/status";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
} from "@/components/ui/item";
import type { Row } from "@/lib/model";
import { cn } from "@/lib/utils";

export function SkillRow({ row, roots }: { row: Row; roots: string[] }) {
	return (
		<Item role="listitem" size="sm" className="relative px-2 hover:bg-raised">
			<ItemContent className="min-w-0 basis-[260px]">
				<SkillName row={row} className="after:absolute after:inset-0" />
				<ItemDescription className="max-w-[72ch]">
					{row.description}
				</ItemDescription>
			</ItemContent>
			<ItemActions className="gap-6 self-start wide:pt-0.5">
				<div className="wide:w-[124px]">
					<LocationIcons presence={row.presence} roots={roots} />
				</div>
				<SkillStatuses row={row} />
			</ItemActions>
		</Item>
	);
}

export function SkillCard({ row, roots }: { row: Row; roots: string[] }) {
	return (
		<li className="relative flex min-w-0 flex-col rounded-md border border-rule bg-raised p-3.5 transition-colors hover:border-ink/40 focus-within:border-ink/50">
			<div className="mb-1.5 flex min-w-0 items-start gap-2">
				<SkillName
					row={row}
					className="block min-w-0 truncate after:absolute after:inset-0"
					title={row.name}
				/>
			</div>
			<p className="mb-4 line-clamp-2 min-h-[3em] text-caption leading-relaxed text-ink-soft">
				{row.description || "No description."}
			</p>
			<div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-rule pt-2.5">
				<LocationIcons presence={row.presence} roots={roots} />
				<SkillStatuses row={row} compact />
			</div>
		</li>
	);
}

function SkillName({
	row,
	className,
	title,
}: {
	row: Row;
	className?: string;
	title?: string;
}) {
	return (
		<a
			className={cn(
				"font-mono text-small font-semibold no-underline hover:underline",
				className,
			)}
			title={title}
			href={`#/skill/${encodeURIComponent(row.name)}`}
		>
			{row.name}
		</a>
	);
}
