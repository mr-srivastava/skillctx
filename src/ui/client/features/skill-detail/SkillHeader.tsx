import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DiffersDot, LocationIcons } from "@/components/presence";
import { SkillStatuses } from "@/components/status";
import { plural } from "@/lib/format";
import type { Row } from "@/lib/model";
import type { SkillRecord } from "../../../../core/inventory/format.ts";
import { sourceLabel } from "../../../../core/provenance/kinds.ts";

/** One label-value pair in the header's summary strip. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<dt className="text-ink-soft">{label}</dt>
			<dd className="flex min-w-0 items-center gap-2 text-ink">{children}</dd>
		</div>
	);
}

/**
 * The same parts as a skill card on the Library page (name, states,
 * description, locations as logos), laid out as a page header.
 */
export function SkillHeader({
	skill,
	row,
	roots,
}: {
	skill: SkillRecord;
	row: Row;
	roots: string[];
}) {
	const sources = row.sources.map(sourceLabel).join(", ");
	const locations = roots.filter((id) => row.presence[id]).length;
	return (
		<header className="mt-7 mb-6 wide:mt-9">
			<a
				href="#/"
				className="inline-flex items-center gap-1.5 text-caption text-ink-soft no-underline hover:text-ink"
			>
				<ArrowLeftIcon aria-hidden className="size-3.5" />
				Library
			</a>
			<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
				<h1 className="font-mono text-[clamp(22px,2.6vw,28px)] leading-tight font-semibold tracking-[-0.02em] wrap-anywhere">
					{skill.name}
				</h1>
				<SkillStatuses row={row} compact />
			</div>
			<p className="mt-1.5 max-w-reading text-ink-soft">
				{skill.description || "No description."}
			</p>
			<dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-rule py-2.5 text-caption">
				{locations > 0 && (
					<Fact label={plural(locations, "location")}>
						<LocationIcons presence={row.presence} roots={roots} max={8} />
					</Fact>
				)}
				<Fact label="Copies">
					<span className="tabular-nums">{skill.copies.length}</span>
					{skill.drift && (
						<span className="inline-flex items-center gap-1.5 text-ink-soft">
							<DiffersDot /> {skill.versions} versions
						</span>
					)}
				</Fact>
				{sources && <Fact label="Installed by">{sources}</Fact>}
			</dl>
		</header>
	);
}
