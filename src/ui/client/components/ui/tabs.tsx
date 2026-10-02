import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/*
 * shadcn's tabs, reduced to the underlined "line" style: a rule under the
 * list, an ink bar under the active tab. Focus uses the page-wide outline.
 * The rule is an inset shadow, not a border, so the active bar can sit on it
 * without overflowing the scrollable list.
 */

function Tabs({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col", className)}
			{...props}
		/>
	);
}

function TabsList({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"flex max-w-full gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--rule)]",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"inline-flex cursor-pointer items-center gap-1.5 border-b-2 border-transparent py-2 text-small font-medium whitespace-nowrap text-ink-soft hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink [&_svg]:size-3.5 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
