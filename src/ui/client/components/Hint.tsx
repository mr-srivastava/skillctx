import type { ComponentProps, ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type HintTrigger = ReactElement<ComponentProps<typeof Button>, typeof Button>;

/** Adds supplemental hover and keyboard detail to an interactive trigger. */
export function Hint({
	text,
	children,
}: {
	text: string;
	children: HintTrigger;
}) {
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}
