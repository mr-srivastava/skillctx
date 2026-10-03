import type { ReactNode } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface PickerItem<T> {
	value: T;
	label: ReactNode;
}

/**
 * A select with no visible label: the toolbars' pickers and filters. Each
 * item's label also shows in the trigger once picked. `label` names the
 * picker for screen readers. `shrink` lets a row of filters fit the toolbar
 * by trimming long picks rather than wrapping early.
 */
export function Picker<T extends string | number>({
	items,
	value,
	onChange,
	label,
	shrink = false,
	className,
}: {
	items: readonly PickerItem<T>[];
	value: T;
	onChange: (value: T) => void;
	label: string;
	shrink?: boolean;
	className?: string;
}) {
	return (
		<Select
			items={items}
			value={value}
			// A single select only reports null when cleared, which these never are.
			onValueChange={(v) => v !== null && onChange(v)}
		>
			<SelectTrigger
				aria-label={label}
				className={cn(
					"max-w-full",
					shrink &&
						"max-w-[min(42vw,12rem)] overflow-hidden [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:overflow-hidden",
					className,
				)}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{items.map((it) => (
					<SelectItem key={it.value} value={it.value}>
						{it.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
