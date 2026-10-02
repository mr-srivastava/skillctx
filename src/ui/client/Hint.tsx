import type { ReactElement } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

/** Adds supplemental hover and keyboard detail to an interactive trigger. */
export function Hint({
	text,
	children,
}: {
	text: string;
	children: ReactElement;
}) {
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}
