import {
	CircleArrowUpIcon,
	GitCompareIcon,
	type LucideIcon,
	PencilIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import type { Status } from "@/lib/model";

/** A file path, repo or hash: the only things set in monospace. */
export function Path({ children }: { children: ReactNode }) {
	return <span className="font-mono text-[0.86em]">{children}</span>;
}

/** The bordered strip that holds a page's pickers and filters. */
export const TOOLBAR =
	"flex flex-wrap items-center gap-2 rounded-md border border-rule bg-raised/40 p-2";

/** Pickers in a toolbar shrink to fit rather than push the row wide. */
export const TOOLBAR_SELECT =
	"max-w-[min(42vw,12rem)] overflow-hidden [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:overflow-hidden";

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

/** Decorative: nearby text already says what's running. */
export function BusySpinner() {
	return <Spinner role="presentation" aria-label={undefined} aria-hidden />;
}

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

/** Marks a logo whose copy differs from the one most locations hold. */
