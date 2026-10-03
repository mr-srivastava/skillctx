import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A bordered, sideways-scrolling block of monospace text: files, fences, patches. */
export function CodeBlock({ className, ...props }: ComponentProps<"pre">) {
	return (
		<pre
			{...props}
			className={cn(
				"overflow-x-auto rounded-md border border-rule bg-raised px-3.5 py-2.5 font-mono text-code leading-relaxed",
				className,
			)}
		/>
	);
}
