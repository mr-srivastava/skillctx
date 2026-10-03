import { CheckIcon, CircleAlertIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Hint } from "@/components/Hint";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

/**
 * Copies `text` to the clipboard, and says so: briefly for a screen reader
 * when it worked, visibly when it didn't. `label` names what's copied.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
	const [state, setState] = useState<CopyState>("idle");
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);

	const show = (next: CopyState, ms: number) => {
		clearTimeout(timer.current);
		setState(next);
		timer.current = setTimeout(() => setState("idle"), ms);
	};

	return (
		<>
			<Hint text={label}>
				<Button
					variant="ghost"
					size="icon-sm"
					className={
						state === "failed" ? "text-problem" : "text-ink-soft hover:text-ink"
					}
					aria-label={label}
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(text);
							show("copied", 1500);
						} catch {
							// Clipboard access can be denied (permissions, embedded
							// browsers). Say so; the text is still selectable.
							show("failed", 4000);
						}
					}}
				>
					{state === "copied" ? (
						<CheckIcon aria-hidden />
					) : state === "failed" ? (
						<CircleAlertIcon aria-hidden />
					) : (
						<CopyIcon aria-hidden />
					)}
				</Button>
			</Hint>
			<span
				className={state === "failed" ? "text-caption text-problem" : "sr-only"}
				role="status"
			>
				{state === "copied"
					? "Copied"
					: state === "failed"
						? "Couldn't copy. Select the text and copy it instead."
						: ""}
			</span>
		</>
	);
}
