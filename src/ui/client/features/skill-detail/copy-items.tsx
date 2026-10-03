import { Path } from "@/components/display";
import type { PickerItem } from "@/components/picker";
import type { SkillRecord } from "../../../../core/inventory/format.ts";

export function copyItems(copies: SkillRecord["copies"]): PickerItem<number>[] {
	return copies.map((copy, index) => ({
		value: index,
		label: (
			<>
				Copy {index + 1}: <Path>{copy.realPath}</Path>
			</>
		),
	}));
}
