import { SearchIcon, XIcon } from "lucide-react";
import { type RefObject, useEffect, useRef } from "react";
import { Toolbar } from "@/components/display";
import { Picker, type PickerItem } from "@/components/picker";
import { rootIcon } from "@/components/presence";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { type Filters, NO_FILTERS, type Row } from "@/lib/model";
import type { InventorySummary } from "../../../../core/inventory/format.ts";
import { sourceLabel } from "../../../../core/provenance/kinds.ts";
import { rootLabel } from "../../../../core/sources/roots.ts";
import { type SkillView, ViewToggle } from "./ViewToggle.tsx";

/** Whether a key press is typing into a field, where "/" is just a slash. */
function isTyping(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || target.matches("input, textarea, select"))
	);
}

/** Press "/" anywhere outside a field to jump to `input`. */
function useSlashToFocus(input: RefObject<HTMLInputElement | null>) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTyping(e.target)) return;
			e.preventDefault();
			input.current?.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [input]);
}

/** The Library's search, filters, sort and view switch. */
export function FilterBar({
	rows,
	roots,
	filters,
	setFilters,
	view,
	setView,
}: {
	rows: Row[];
	/** Locations present on this machine, in display order. */
	roots: InventorySummary["roots"];
	filters: Filters;
	setFilters: (f: Filters | ((f: Filters) => Filters)) => void;
	view: SkillView;
	setView: (view: SkillView) => void;
}) {
	const search = useRef<HTMLInputElement>(null);
	useSlashToFocus(search);
	const set = (patch: Partial<Filters>) =>
		setFilters((f) => ({ ...f, ...patch }));
	const sources = [...new Set(rows.flatMap((r) => r.sources))].sort();

	// "" is the no-filter value, as in Filters.
	const sourceItems: PickerItem<string>[] = [
		{ value: "", label: "Installed by anything" },
		...sources.map((s) => ({ value: s, label: sourceLabel(s) })),
	];
	const rootItems: PickerItem<string>[] = [
		{ value: "", label: "In any location" },
		...roots.map((r) => {
			const Logo = rootIcon(r.id);
			return {
				value: r.id,
				label: (
					<>
						<Logo aria-hidden />
						In {rootLabel(r.id)} ({r.entries})
					</>
				),
			};
		}),
	];
	const sortItems: PickerItem<Filters["sort"]>[] = [
		{ value: "attention", label: "Needs attention first" },
		{ value: "name", label: "A to Z" },
	];

	const filtered = Boolean(
		filters.query || filters.source || filters.root || filters.status,
	);

	return (
		<Toolbar className="mb-4">
			<InputGroup className="w-auto max-w-[420px] flex-[1_1_260px]">
				<InputGroupAddon align="inline-start">
					<SearchIcon aria-hidden />
				</InputGroupAddon>
				<InputGroupInput
					ref={search}
					type="search"
					placeholder="Find a skill"
					value={filters.query}
					onChange={(e) => set({ query: e.target.value })}
					aria-label="Find a skill by name or description"
					aria-keyshortcuts="/"
				/>
				{/* The shortcut is useless without a keyboard; hide it on phones. */}
				<InputGroupAddon align="inline-end" className="hidden wide:flex">
					<Kbd>/</Kbd>
				</InputGroupAddon>
			</InputGroup>
			<Picker
				items={sourceItems}
				value={filters.source}
				onChange={(source) => set({ source })}
				label="Installed by"
				shrink
			/>
			<Picker
				items={rootItems}
				value={filters.root}
				onChange={(root) => set({ root })}
				label="Location"
				shrink
			/>
			<Picker
				items={sortItems}
				value={filters.sort}
				onChange={(sort) => set({ sort })}
				label="Sort"
				shrink
			/>
			{filtered && (
				<Button
					variant="link"
					size="inline"
					className="gap-1"
					onClick={() => setFilters({ ...NO_FILTERS, sort: filters.sort })}
				>
					<XIcon aria-hidden className="size-3.5" />
					Clear filters
				</Button>
			)}
			<ViewToggle view={view} setView={setView} />
		</Toolbar>
	);
}
