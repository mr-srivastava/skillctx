import { LayoutGridIcon, ListIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SkillView = "list" | "grid";

const VIEWS: { value: SkillView; label: string; icon: LucideIcon }[] = [
	{ value: "grid", label: "Card view", icon: LayoutGridIcon },
	{ value: "list", label: "List view", icon: ListIcon },
];

/** Two pressed-or-not buttons that show the Library as cards or a list. */
export function ViewToggle({
	view,
	setView,
}: {
	view: SkillView;
	setView: (view: SkillView) => void;
}) {
	return (
		<div
			className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md border border-rule bg-paper p-0.5"
			role="group"
			aria-label="Skill view"
		>
			{VIEWS.map(({ value, label, icon: Icon }) => (
				<Button
					key={value}
					variant="ghost"
					size="icon-xs"
					className={cn(
						"size-8",
						view === value &&
							"bg-ink text-paper hover:bg-ink/90 hover:text-paper",
					)}
					aria-label={label}
					title={label}
					aria-pressed={view === value}
					onClick={() => setView(value)}
				>
					<Icon aria-hidden />
				</Button>
			))}
		</div>
	);
}
