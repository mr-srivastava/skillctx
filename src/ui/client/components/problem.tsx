import { CircleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function Problem({
	title,
	children,
	className,
	role,
}: {
	title: ReactNode;
	children: ReactNode;
	className?: string;
	/** Defaults to "alert"; pass "note" for problems that are part of the page. */
	role?: "alert" | "note";
}) {
	return (
		<Alert
			variant="destructive"
			className={cn("max-w-reading", className)}
			role={role ?? "alert"}
		>
			<CircleAlertIcon aria-hidden />
			<AlertTitle className="line-clamp-none wrap-anywhere">{title}</AlertTitle>
			<AlertDescription>{children}</AlertDescription>
		</Alert>
	);
}
