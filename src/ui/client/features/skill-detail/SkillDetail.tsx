import { Path } from "@/components/display";
import { Problem } from "@/components/problem";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { InventorySummary, SkillRecord } from "@/lib/core";
import { mainCopy, type Row } from "@/lib/model";
import type { DetailTab } from "@/lib/routes";
import { AdviceNotes } from "./AdviceNotes.tsx";
import { Contents } from "./Contents.tsx";
import { CopyList } from "./CopyList.tsx";
import { DiffView } from "./DiffView.tsx";
import { SkillHeader } from "./SkillHeader.tsx";

/** Frontmatter problems, one box per copy that has them. */
function Diagnostics({ skill }: { skill: SkillRecord }) {
	const broken = skill.copies.filter((c) => c.diagnostics.length > 0);
	if (broken.length === 0) return null;
	return (
		<div className="mb-2 grid max-w-reading gap-2">
			{broken.map((c) => (
				// Part of the page, not a live event: don't interrupt a
				// screen reader the way role="alert" would.
				<Problem key={c.realPath} role="note" title={<Path>{c.realPath}</Path>}>
					<ul>
						{c.diagnostics.map((d) => (
							<li key={d}>{d}</li>
						))}
					</ul>
				</Problem>
			))}
		</div>
	);
}

export function SkillDetail({
	skill,
	row,
	summary,
	tab,
	onTab,
}: {
	skill: SkillRecord;
	row: Row;
	summary: InventorySummary;
	tab: DetailTab;
	onTab: (tab: DetailTab) => void;
}) {
	const roots = summary.roots.filter((r) => r.present).map((r) => r.id);
	const main = mainCopy(skill);
	const mainIndex = main ? skill.copies.indexOf(main) : 0;
	const canCompare = skill.versions > 1;
	const shownTab = tab === "copies" && !canCompare ? "contents" : tab;
	return (
		<article>
			<SkillHeader skill={skill} row={row} roots={roots} />
			<AdviceNotes skill={skill} row={row} />
			<Diagnostics skill={skill} />

			<Tabs
				value={shownTab}
				onValueChange={(v) => onTab(v as DetailTab)}
				className="mt-8"
			>
				<TabsList>
					<TabsTrigger value="contents">Contents</TabsTrigger>
					<TabsTrigger value="where">Where it lives</TabsTrigger>
					{canCompare && (
						<TabsTrigger value="copies">Compare copies</TabsTrigger>
					)}
				</TabsList>
				<TabsContent value="contents">
					<Contents key={skill.name} skill={skill} mainCopy={mainIndex} />
				</TabsContent>
				<TabsContent value="where" className="pt-6">
					<CopyList skill={skill} roots={roots} />
				</TabsContent>
				{canCompare && (
					<TabsContent value="copies" className="pt-6">
						<DiffView skill={skill} />
					</TabsContent>
				)}
			</Tabs>
		</article>
	);
}
