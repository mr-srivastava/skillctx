import type { ComponentProps, ReactNode } from "react";

/** Join class names, skipping falsy ones. */
export function cx(...classes: (string | false | null | undefined)[]): string {
	return classes.filter(Boolean).join(" ");
}

/** Text inputs and selects. */
export const FIELD = "rounded-md border border-rule bg-raised px-3 py-1.5";

const BUTTON = {
	default: `${FIELD} hover:enabled:border-ink-soft`,
	primary: "rounded-md border border-ink bg-ink px-3 py-1.5 text-paper",
	plain:
		"px-1 py-1.5 text-ink-soft underline decoration-rule underline-offset-3 hover:enabled:decoration-current",
};

export function Button({
	variant = "default",
	className,
	...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON }) {
	return (
		<button
			type="button"
			{...props}
			className={cx(
				"cursor-pointer disabled:cursor-default disabled:opacity-55",
				BUTTON[variant],
				className,
			)}
		/>
	);
}

/** A file path, repo or hash: the only things set in monospace. */
export function Path({ children }: { children: ReactNode }) {
	return <span className="font-mono text-[0.86em]">{children}</span>;
}

export const H2 = "mt-10 mb-2.5 text-heading font-semibold";

/** The large sentence-style heading on the list and empty pages. */
export const HEADLINE =
	"max-w-[40ch] text-[clamp(24px,3.4vw,34px)] leading-[1.3] font-medium tracking-[-0.015em] text-balance";

/** Bordered note with a coloured left edge, used for advice and problems. */
export function Notes({
	tone = "ink",
	children,
}: {
	tone?: "ink" | "problem";
	children: ReactNode;
}) {
	return (
		<ul
			className={cx(
				"max-w-[72ch] [&>li]:mb-2 [&>li]:rounded-r-md [&>li]:border-l-3 [&>li]:bg-raised [&>li]:px-4 [&>li]:py-3",
				tone === "problem" ? "[&>li]:border-problem" : "[&>li]:border-ink",
			)}
		>
			{children}
		</ul>
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
	headSkill: cx(HEAD, SKILL_COL),
	headLoc: cx(HEAD, "w-16 text-center"),
	headState: cx(HEAD, "w-[170px] pl-4 text-left"),
	bodySkill: cx(BODY, SKILL_COL, "py-2.5"),
	bodyLoc: cx(BODY, "w-16 pt-3.25 pb-2.5 text-center"),
	bodyState: cx(BODY, "w-[170px] py-2.5 pl-4 text-left"),
};
