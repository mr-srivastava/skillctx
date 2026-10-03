import { CircleAlertIcon, type LucideIcon } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Notes } from "@/components/display";
import { STATUS } from "@/components/status";
import { type Advice, adviceFor } from "@/lib/advice";
import type { Row } from "@/lib/model";
import { cn } from "@/lib/utils";
import type { SkillRecord } from "../../../../core/inventory/format.ts";

/** The icon and colour for a piece of advice: its status's, or a problem's. */
function adviceLook(kind: Advice["kind"]): { icon: LucideIcon; tone: string } {
	return kind === "error"
		? { icon: CircleAlertIcon, tone: "text-problem" }
		: STATUS[kind];
}

/** What to do about a skill (adviceFor), with any command ready to copy. */
export function AdviceNotes({ skill, row }: { skill: SkillRecord; row: Row }) {
	const items = adviceFor(skill, row);
	if (items.length === 0) return null;
	return (
		<Notes>
			{items.map(({ key, kind, text, command }) => {
				const { icon: Icon, tone } = adviceLook(kind);
				return (
					<li key={key} className="flex gap-2.5">
						<Icon aria-hidden className={cn("mt-1 size-4 shrink-0", tone)} />
						<div className="min-w-0">
							{text}
							{command && (
								<div className="mt-2 flex flex-wrap items-center gap-2">
									<code className="max-w-full overflow-x-auto rounded-md border border-rule bg-paper px-2.5 py-1.5 font-mono text-caption whitespace-nowrap">
										{command}
									</code>
									<CopyButton text={command} label="Copy command" />
								</div>
							)}
						</div>
					</li>
				);
			})}
		</Notes>
	);
}
