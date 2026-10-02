import type { SkillRecord } from "../../core/inventory/format.ts";
import { Path } from "./display.tsx";

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
