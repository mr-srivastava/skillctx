import type { ReactElement, ReactNode } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** A file path, repo or hash: the only things set in monospace. */
export function Path({ children }: { children: ReactNode }) {
	return <span className="font-mono text-[0.86em]">{children}</span>;
}

export const H2 = "mt-10 mb-2.5 text-heading font-semibold";

/** The large sentence-style heading on the list and empty pages. */
export const HEADLINE =
	"max-w-[40ch] text-[clamp(24px,3.4vw,34px)] leading-[1.3] font-medium tracking-[-0.015em] text-balance";

/** Notes with an ink left edge: what to do about a skill. */
export function Notes({ children }: { children: ReactNode }) {
	return (
		<ul className="max-w-[72ch] [&>li]:mb-2 [&>li]:rounded-r-md [&>li]:border-l-3 [&>li]:border-ink [&>li]:bg-raised [&>li]:px-4 [&>li]:py-3">
			{children}
		</ul>
	);
}

/**
 * A tooltip on hover and keyboard focus. Radix tooltips don't open on touch,
 * so anything a phone user needs must also be visible or in sr-only text.
 */
export function Hint({
	text,
	children,
}: {
	text: string;
	children: ReactElement;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}

/*
 * Presence table cells. Each string is complete for its slot so no two
 * utilities on one element set the same property.
 */
const HEAD =
	"border-b border-ink py-2 align-bottom text-caption font-medium whitespace-nowrap text-ink-soft";
const BODY = "border-b border-rule align-top font-normal";
const SKILL_COL = "min-w-[220px] pr-2 text-left wide:min-w-[280px]";

export const CELL = {
	headSkill: cn(HEAD, SKILL_COL),
	headLoc: cn(HEAD, "w-16 text-center"),
	headState: cn(HEAD, "w-[170px] pl-4 text-left"),
	bodySkill: cn(BODY, SKILL_COL, "py-2.5"),
	bodyLoc: cn(BODY, "w-16 pt-3.25 pb-2.5 text-center"),
	bodyState: cn(BODY, "w-[170px] py-2.5 pl-4 text-left"),
};
