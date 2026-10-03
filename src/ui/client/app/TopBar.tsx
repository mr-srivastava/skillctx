import {
	CircleAlertIcon,
	CircleArrowUpIcon,
	CircleCheckIcon,
	FolderSyncIcon,
} from "lucide-react";
import { BusySpinner } from "@/components/display";
import { Hint } from "@/components/Hint";
import { Button } from "@/components/ui/button";
import type { UpstreamReport } from "@/lib/core";
import { LIBRARY_HREF } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Busy, RefreshNotice } from "./useRefreshStatus.ts";

function when(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function TopBar({
	busy,
	onRefresh,
	notice,
	upstream,
}: {
	busy: Busy;
	onRefresh: (check: boolean) => void;
	notice: RefreshNotice | null;
	upstream: UpstreamReport | null;
}) {
	return (
		<header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule py-4.5">
			<a
				href={LIBRARY_HREF}
				className="text-lead font-semibold tracking-[-0.01em] no-underline"
			>
				skillctx
			</a>
			<div className="flex flex-wrap items-center gap-2 wide:flex-nowrap">
				<span className="basis-full text-caption text-ink-soft wide:mr-2 wide:basis-auto">
					{busy === "check"
						? "Asking GitHub and git remotes…"
						: busy === "scan"
							? "Scanning skill folders…"
							: upstream
								? `Checked for updates ${when(upstream.checkedAt)}`
								: "Not checked for updates yet"}
				</span>
				<Hint text="Re-read every skill folder on this machine">
					<Button
						variant="outline"
						disabled={busy !== null}
						onClick={() => onRefresh(false)}
					>
						{busy === "scan" ? <BusySpinner /> : <FolderSyncIcon aria-hidden />}
						Rescan
					</Button>
				</Hint>
				<Hint text="Rescan, then compare with GitHub and git remotes. Uses the network.">
					<Button
						variant="default"
						disabled={busy !== null}
						onClick={() => onRefresh(true)}
					>
						{busy === "check" ? (
							<BusySpinner />
						) : (
							<CircleArrowUpIcon aria-hidden />
						)}
						Check for updates
					</Button>
				</Hint>
			</div>
			{notice && (
				<p
					className={cn(
						"flex basis-full items-start gap-2 text-small",
						notice.ok ? "text-ink-soft" : "text-problem",
					)}
					role="status"
					aria-live="polite"
				>
					{notice.ok ? (
						<CircleCheckIcon aria-hidden className="mt-0.75 size-4 shrink-0" />
					) : (
						<CircleAlertIcon aria-hidden className="mt-0.75 size-4 shrink-0" />
					)}
					{notice.text}
				</p>
			)}
		</header>
	);
}
