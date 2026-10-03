import type { ComponentProps, ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** A file path, repo or hash: the only things set in monospace. */
export function Path({ children }: { children: ReactNode }) {
	return <span className="font-mono text-[0.86em]">{children}</span>;
}

/** The bordered strip that holds a page's pickers and filters. */
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			{...props}
			className={cn(
				"flex flex-wrap items-center gap-2 rounded-md border border-rule bg-raised/40 p-2",
				className,
			)}
		/>
	);
}

/** The large heading on the Library and the empty page. One per page. */
export function PageHeading({
	className,
	children,
	...props
}: ComponentProps<"h1">) {
	return (
		<h1
			{...props}
			className={cn(
				"max-w-[40ch] text-display leading-[1.3] font-medium tracking-[-0.015em] text-balance",
				className,
			)}
		>
			{children}
		</h1>
	);
}

/** Notes with an ink left edge: what to do about a skill. */
export function Notes({ children }: { children: ReactNode }) {
	return (
		<ul className="max-w-reading [&>li]:mb-2 [&>li]:rounded-r-md [&>li]:border-l-3 [&>li]:border-ink [&>li]:bg-raised [&>li]:px-4 [&>li]:py-3">
			{children}
		</ul>
	);
}

/** Decorative: nearby text already says what's running. */
export function BusySpinner() {
	return <Spinner role="presentation" aria-label={undefined} aria-hidden />;
}
