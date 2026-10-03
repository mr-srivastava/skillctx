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
 * picker for screen readers.
 */
export function Picker<T extends string | number>({
	items,
	value,
	onChange,
	label,
	className,
}: {
	items: readonly PickerItem<T>[];
	value: T;
	onChange: (value: T) => void;
	label: string;
	className?: string;
}) {
	return (
		<Select
			items={items}
			value={value}
			// A single select only reports null when cleared, which these never are.
			onValueChange={(v) => v !== null && onChange(v)}
		>
			<SelectTrigger aria-label={label} className={cn("max-w-full", className)}>
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
