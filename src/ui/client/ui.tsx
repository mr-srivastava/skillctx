import {
	CircleAlertIcon,
	CircleArrowUpIcon,
	GitCompareIcon,
	type LucideIcon,
	PencilIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { rootLabel } from "../../core/sources/roots.ts";
import type { Presence, Status } from "./model.ts";

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

/** One icon per status, shared by the State column and the advice notes. */
export const STATUS_ICON: Record<Status, LucideIcon> = {
	outdated: CircleArrowUpIcon,
	edited: PencilIcon,
	drift: GitCompareIcon,
	warnings: TriangleAlertIcon,
};

export const STATUS_TEXT: Record<Status, string> = {
	outdated: "text-outdated",
	edited: "text-edited",
	drift: "text-differs",
	warnings: "text-problem",
};

export const DESC =
	"mt-0.5 line-clamp-2 max-w-[64ch] text-caption text-ink-soft";

/**
 * Decorative: the busy text next to the buttons already says what's running.
 * It takes the place of the button's icon so the button keeps its width.
 */
export function BusySpinner() {
	return <Spinner role="presentation" aria-label={undefined} aria-hidden />;
}

export function Problem({
	title,
	children,
	className,
	role,
}: {
	title: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	/** Defaults to "alert"; pass "note" for problems that are part of the page. */
	role?: "alert" | "note";
}) {
	return (
		<Alert
			variant="destructive"
			className={cn("max-w-[72ch]", className)}
			role={role ?? "alert"}
		>
			<CircleAlertIcon aria-hidden />
			<AlertTitle className="line-clamp-none wrap-anywhere">{title}</AlertTitle>
			<AlertDescription>{children}</AlertDescription>
		</Alert>
	);
}

export const PRESENCE_TEXT: Record<Presence, string> = {
	folder: "Real folder",
	link: "Symlink",
	differs: "Copy with different content",
	absent: "Not here",
};

const SQUARE = "inline-block size-3.25 rounded-xs align-[-2px]";
const PRESENCE_CELL: Record<Presence, string> = {
	folder: `${SQUARE} bg-ink`,
	link: `${SQUARE} border-[1.5px] border-ink`,
	differs: `${SQUARE} bg-differs`,
	absent: "m-1 inline-block size-1.25 rounded-full bg-rule align-[0]",
};

export function Cell({
	presence,
	root,
}: {
	presence: Presence;
	root?: string;
}) {
	if (!root)
		return <span className={PRESENCE_CELL[presence]} aria-hidden="true" />;
	const text = `${PRESENCE_TEXT[presence]} in ${rootLabel(root)}`;
	return (
		<Hint text={text}>
			<span className={PRESENCE_CELL[presence]}>
				<span className="sr-only">{text}</span>
			</span>
		</Hint>
	);
}
