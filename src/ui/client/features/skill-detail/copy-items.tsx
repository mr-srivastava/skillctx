import { Path } from "@/components/display";
import type { SkillRecord } from "../../../../core/inventory/format.ts";

export function copyItems(copies: SkillRecord["copies"]) {
	return copies.map((copy, index) => ({
		value: index,
		label: (
			<>
				Copy {index + 1}: <Path>{copy.realPath}</Path>
			</>
		),
	}));
}
