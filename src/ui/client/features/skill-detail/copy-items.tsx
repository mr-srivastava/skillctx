import { Path } from "@/components/display";
import type { PickerItem } from "@/components/picker";
import type { CopyRecord } from "@/lib/core";

export function copyItems(copies: CopyRecord[]): PickerItem<number>[] {
	return copies.map((copy, index) => ({
		value: index,
		label: (
			<>
				Copy {index + 1}: <Path>{copy.realPath}</Path>
			</>
		),
	}));
}
