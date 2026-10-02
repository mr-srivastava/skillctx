import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "@/lib/utils";

/*
 * Base UI always renders role="separator". `decorative` (on by default, as in
 * shadcn's Radix version) drops the role so a rule between list items doesn't
 * break the list's listitem-only children.
 */
function Separator({
	className,
	orientation = "horizontal",
	decorative = true,
	...props
}: SeparatorPrimitive.Props & { decorative?: boolean }) {
	return (
		<SeparatorPrimitive
			data-slot="separator"
			orientation={orientation}
			{...(decorative && { role: "none", "aria-orientation": undefined })}
			className={cn(
				"shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
				className,
			)}
			{...props}
		/>
	);
}

export { Separator };
