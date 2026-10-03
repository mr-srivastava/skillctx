import { Fragment } from "react";
import { Path } from "@/components/display";
import { ListLegend, LocationIcons } from "@/components/presence";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemSeparator,
} from "@/components/ui/item";
import { formatBytes, plural } from "@/lib/format";
import { copyPresence, mainCopy } from "@/lib/model";
import type { SkillRecord } from "../../../../core/inventory/format.ts";
import {
	provenanceDetails,
	sourceLabel,
} from "../../../../core/provenance/kinds.ts";

type Copy = SkillRecord["copies"][number];

/** Size and state of one copy, in the style of a list row's description. */
function copyFacts(copy: Copy, index: number, isMain: boolean): string {
	return [
		`Copy ${index + 1}`,
		plural(copy.fileCount, "file"),
		formatBytes(copy.bytes),
		...(isMain ? [] : ["different content"]),
		...(copy.installState === "modified" ? ["edited after install"] : []),
	].join(" · ");
}

function ProvenanceText({ p }: { p: Copy["provenance"][number] }) {
	return provenanceDetails(p).map((d, i) =>
		d.as === "path" ? (
			<Path key={i}>{d.text}</Path>
		) : d.as === "soft" ? (
			<span key={i} className="text-ink-soft">
				{d.text}
			</span>
		) : (
			d.text
		),
	);
}

/**
 * Each copy on disk as a row, like the Library list: its folder, which
 * locations read it (logos; the hint says folder or symlink), and what
 * installed it.
 */
export function CopyList({
	skill,
	roots,
}: {
	skill: SkillRecord;
	roots: string[];
}) {
	const main = mainCopy(skill);
	const untracked = skill.copies.every((c) => c.provenance.length === 0);
	return (
		<>
			<ListLegend
				count={`${plural(skill.copies.length, "copy", "copies")} on disk`}
				differs={skill.drift}
			/>
			<ItemGroup aria-label="Copies on disk">
				{skill.copies.map((c, i) => (
					<Fragment key={c.realPath}>
						{i > 0 && <ItemSeparator />}
						<Item role="listitem" size="sm" className="items-start px-2">
							<ItemContent className="min-w-0 basis-[320px]">
								<span className="font-mono text-small font-semibold wrap-anywhere">
									{c.realPath}
								</span>
								<ItemDescription>
									{copyFacts(c, i, c.hash === main?.hash)}
								</ItemDescription>
								{c.provenance.length > 0 && (
									<ul className="mt-1 grid gap-0.5 text-caption">
										{c.provenance.map((p) => (
											<li key={p.kind} className="wrap-break-word">
												<span className="font-medium">
													{sourceLabel(p.kind)}
												</span>
												<span className="text-ink-soft">: </span>
												<ProvenanceText p={p} />
											</li>
										))}
									</ul>
								)}
							</ItemContent>
							<div className="self-start pt-0.5 wide:w-[180px]">
								<LocationIcons
									presence={copyPresence(skill, c)}
									roots={roots}
									max={8}
								/>
							</div>
						</Item>
					</Fragment>
				))}
			</ItemGroup>
			{untracked && (
				<p className="mt-4 max-w-reading text-caption text-ink-soft">
					No installer recorded this skill, so it can't be checked for updates.
				</p>
			)}
		</>
	);
}
