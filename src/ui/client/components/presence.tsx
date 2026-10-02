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

const HEAD =
	"border-b border-ink py-2 align-bottom text-caption font-medium whitespace-nowrap text-ink-soft";
const BODY = "border-b border-rule align-top font-normal";
const SKILL_COL = "min-w-[220px] pr-2 text-left wide:min-w-[280px]";

export const CELL = {
	headSkill: cn(HEAD, SKILL_COL),
	headLoc: cn(HEAD, "w-16 text-center"),
	headState: cn(HEAD, "w-[170px] pl-4 text-left"),
	bodySkill: cn(BODY, SKILL_COL, "py-2.5"),
	bodyLoc: cn(BODY, "w-16 pt-3.25 pb-2.5 text-center"),
	bodyState: cn(BODY, "w-[170px] py-2.5 pl-4 text-left"),
};

export const PRESENCE_TEXT: Record<Presence, string> = {
	folder: "Real folder",
	link: "Symlink",
	differs: "Copy with different content",
	absent: "Not here",
};

const SQUARE = "inline-block size-3.25 rounded-xs align-[-2px]";
const PRESENCE_CELL: Record<Presence, string> = {
	folder: `${SQUARE} bg-ink`,
	link: `${SQUARE} border-[1.5px] border-ink`,
	differs: `${SQUARE} bg-differs`,
	absent: "m-1 inline-block size-1.25 rounded-full bg-rule align-[0]",
};

export function Cell({
	presence,
	root,
}: {
	presence: Presence;
	root?: string;
}) {
	if (!root)
		return <span className={PRESENCE_CELL[presence]} aria-hidden="true" />;
	const text = `${PRESENCE_TEXT[presence]} in ${rootLabel(root)}`;
	return (
		<span className={PRESENCE_CELL[presence]}>
			<span className="sr-only">{text}</span>
		</span>
	);
}

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
