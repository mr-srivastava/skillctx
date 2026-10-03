import { BotIcon, FolderIcon, LibraryIcon, PlugIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { Presence } from "@/lib/model";
import { cn } from "@/lib/utils";
import { PLUGIN_ROOT_PREFIX, rootLabel } from "../../../core/sources/roots.ts";
import {
	ClaudeLogo,
	CodexLogo,
	CursorLogo,
	GeminiLogo,
	OpenCodeLogo,
} from "./logos.tsx";

/** Marks a location whose copy differs from the one most locations hold. */
export function DiffersDot({ className }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={cn(
				"size-2 rounded-full bg-differs ring-2 ring-background",
				className,
			)}
		/>
	);
}

/**
 * The rule-topped line above a list of skills or copies: how many, and the
 * key to the differs dot when the list can show one.
 */
export function ListLegend({
	count,
	differs = true,
}: {
	count: string;
	differs?: boolean;
}) {
	return (
		<p className="mb-1 flex flex-wrap gap-x-5 gap-y-1.5 border-b border-rule pb-2 text-caption text-ink-soft">
			<span className="font-medium">{count}</span>
			{differs && (
				<span className="inline-flex items-center gap-1.75">
					<DiffersDot /> copy with different content
				</span>
			)}
		</p>
	);
}

export const PRESENCE_TEXT: Record<Presence, string> = {
	folder: "Real folder",
	link: "Symlink",
	differs: "Copy with different content",
	absent: "Not here",
};

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const ROOT_ICON: Record<string, Icon> = {
	agents: BotIcon,
	"claude-code": ClaudeLogo,
	codex: CodexLogo,
	cursor: CursorLogo,
	gemini: GeminiLogo,
	opencode: OpenCodeLogo,
	"skills-manager": LibraryIcon,
};

export function rootIcon(id: string): Icon {
	return (
		ROOT_ICON[id] ?? (id.startsWith(PLUGIN_ROOT_PREFIX) ? PlugIcon : FolderIcon)
	);
}

/**
 * Shows skill locations as logos. Overflow names remain available to screen
 * readers; the visible tooltip is supplemental and is not an interaction.
 */
export function LocationIcons({
	presence,
	roots,
	max = 5,
}: {
	presence: Record<string, Presence>;
	/** Location ids in display order. */
	roots: string[];
	max?: number;
}) {
	const here = roots.filter((id) => presence[id]);
	const shown = here.length > max ? here.slice(0, max - 1) : here;
	const rest = here.slice(shown.length);
	const say = (id: string) =>
		`${PRESENCE_TEXT[presence[id] ?? "absent"]} in ${rootLabel(id)}`;
	return (
		<ul className="relative flex items-center gap-2">
			{shown.map((id) => {
				const Logo = rootIcon(id);
				return (
					<li key={id} className="flex" title={say(id)}>
						<span className="relative flex text-ink">
							<Logo aria-hidden className="size-4" />
							{presence[id] === "differs" && (
								<DiffersDot className="absolute -top-0.5 -right-0.5" />
							)}
							<span className="sr-only">{say(id)}</span>
						</span>
					</li>
				);
			})}
			{rest.length > 0 && (
				<li className="flex" title={rest.map(say).join(". ")}>
					<span className="relative text-caption text-ink-soft">
						+{rest.length}
						{rest.some((id) => presence[id] === "differs") && (
							<DiffersDot className="absolute -top-0.5 -right-2" />
						)}
						<span className="sr-only">: {rest.map(say).join(". ")}</span>
					</span>
				</li>
			)}
		</ul>
	);
}
