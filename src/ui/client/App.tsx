import {
	ArrowLeftIcon,
	CheckIcon,
	CircleAlertIcon,
	CircleArrowUpIcon,
	CircleCheckIcon,
	CopyIcon,
	FileDiffIcon,
	FileMinusIcon,
	FilePlusIcon,
	FolderSearchIcon,
	FolderSyncIcon,
	GitCompareIcon,
	type LucideIcon,
	PencilIcon,
	SearchIcon,
	TriangleAlertIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { InventorySummary } from "../../core/inventory.ts";
import type { UpstreamReport } from "../../core/upstream/index.ts";
import type { CopyDiff, SkillRecord } from "../data.ts";
import {
	countBy,
	type Filters,
	filterRows,
	NO_FILTERS,
	type Presence,
	type Row,
	rootLabel,
	SOURCE_LABEL,
	STATUS_LABEL,
	type Status,
	toRows,
	updateCommand,
} from "./model.ts";
import { CELL, H2, HEADLINE, Hint, Notes, Path } from "./ui.tsx";

const PAGE = "mx-auto max-w-[1180px] px-4 pb-16 wide:px-8 wide:pb-24";

/** One icon per status, shared by the State column and the advice notes. */
const STATUS_ICON: Record<Status, LucideIcon> = {
	outdated: CircleArrowUpIcon,
	edited: PencilIcon,
	drift: GitCompareIcon,
	warnings: TriangleAlertIcon,
};

const STATUS_TEXT: Record<Status, string> = {
	outdated: "text-outdated",
	edited: "text-edited",
	drift: "text-differs",
	warnings: "text-problem",
};

const ANY = "any";

const DESC = "mt-0.5 line-clamp-2 max-w-[64ch] text-caption text-ink-soft";
const FACT =
	"grid gap-0.5 border-b border-rule py-2.25 wide:grid-cols-[180px_1fr] wide:gap-4";

interface Data {
	summary: InventorySummary | null;
	upstream: UpstreamReport | null;
	skills: SkillRecord[];
}

type Busy = null | "scan" | "check";

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url} returned ${res.status}`);
	return (await res.json()) as T;
}

function readHash(): string | null {
	const m = /^#\/skill\/(.+)$/.exec(window.location.hash);
	return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function useHashRoute(): string | null {
	const [name, setName] = useState(readHash);
	useEffect(() => {
		const onChange = () => {
			setName(readHash());
			window.scrollTo(0, 0);
		};
		window.addEventListener("hashchange", onChange);
		return () => window.removeEventListener("hashchange", onChange);
	}, []);
	return name;
}

function when(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function App() {
	const [data, setData] = useState<Data | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [busy, setBusy] = useState<Busy>(null);
	const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
		null,
	);
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const selected = useHashRoute();

	const load = useCallback(async () => {
		try {
			const [summary, upstream, skills] = await Promise.all([
				getJson<InventorySummary | null>("/api/summary"),
				getJson<UpstreamReport | null>("/api/upstream"),
				getJson<SkillRecord[]>("/api/skills"),
			]);
			setData({ summary, upstream, skills });
			setLoadError(null);
		} catch (e) {
			setLoadError((e as Error).message);
		}
	}, []);

	useEffect(() => {
		// oxlint-disable-next-line react/set-state-in-effect -- load() sets state after its fetches resolve, not synchronously.
		void load();
	}, [load]);

	const refresh = async (check: boolean) => {
		setBusy(check ? "check" : "scan");
		setResult(null);
		try {
			const { token } = await getJson<{ token: string }>("/api/session");
			const res = await fetch("/api/refresh", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-skillctx-token": token,
				},
				body: JSON.stringify({ check }),
			});
			const body = (await res.json()) as { message?: string; error?: string };
			setResult(
				res.ok
					? { ok: true, text: body.message ?? "Done." }
					: {
							ok: false,
							text: body.error ?? `Refresh failed (${res.status}).`,
						},
			);
			await load();
		} catch (e) {
			setResult({
				ok: false,
				text: `Couldn't reach skillctx. Check that \`skillctx ui\` is still running. (${(e as Error).message})`,
			});
		} finally {
			setBusy(null);
		}
	};

	const rows = useMemo(
		() => (data ? toRows(data.skills, data.upstream) : []),
		[data],
	);

	const bar = (
		<TopBar
			busy={busy}
			onRefresh={refresh}
			result={result}
			upstream={data?.upstream ?? null}
		/>
	);

	if (loadError) {
		return (
			<main className={PAGE}>
				{bar}
				<Problem className="my-10" title="The inventory couldn't be loaded">
					{loadError}. Restart <code>skillctx ui</code> and reload this page.
				</Problem>
			</main>
		);
	}
	if (!data) {
		return (
			<main className={PAGE}>
				{bar}
				<p className="my-10 text-ink-soft">Loading the inventory…</p>
			</main>
		);
	}
	if (!data.summary) {
		return (
			<main className={PAGE}>
				{bar}
				<section className="max-w-[52ch] py-12">
					<h1 className={cn(HEADLINE, "mb-7")}>No inventory yet</h1>
					<p className="mb-5">
						Scan your skill folders to see every skill on this machine and where
						it lives.
					</p>
					<Button
						variant="default"
						disabled={busy !== null}
						onClick={() => refresh(false)}
					>
						{busy ? <BusySpinner /> : <FolderSearchIcon aria-hidden />}
						{busy ? "Scanning…" : "Scan now"}
					</Button>
				</section>
			</main>
		);
	}

	const skill = selected
		? data.skills.find((s) => s.name === selected)
		: undefined;

	return (
		<main className={PAGE}>
			{bar}
			{selected ? (
				skill ? (
					<SkillDetail
						skill={skill}
						row={rows.find((r) => r.name === skill.name)}
						summary={data.summary}
					/>
				) : (
					<Problem
						className="my-10"
						title={`There's no skill named “${selected}” in the inventory`}
					>
						<a href="#/">Show all skills</a>
					</Problem>
				)
			) : (
				<SkillList
					rows={rows}
					summary={data.summary}
					filters={filters}
					setFilters={setFilters}
				/>
			)}
		</main>
	);
}

function TopBar({
	busy,
	onRefresh,
	result,
	upstream,
}: {
	busy: Busy;
	onRefresh: (check: boolean) => void;
	result: { ok: boolean; text: string } | null;
	upstream: UpstreamReport | null;
}) {
	return (
		<header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule py-4.5">
			<a
				href="#/"
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
			{result && (
				<p
					className={cn(
						"flex basis-full items-start gap-2 text-small",
						result.ok ? "text-ink-soft" : "text-problem",
					)}
					role="status"
					aria-live="polite"
				>
					{result.ok ? (
						<CircleCheckIcon aria-hidden className="mt-0.75 size-4 shrink-0" />
					) : (
						<CircleAlertIcon aria-hidden className="mt-0.75 size-4 shrink-0" />
					)}
					{result.text}
				</p>
			)}
		</header>
	);
}

/**
 * Decorative: the busy text next to the buttons already says what's running.
 * It takes the place of the button's icon so the button keeps its width.
 */
function BusySpinner() {
	return <Spinner role="presentation" aria-label={undefined} aria-hidden />;
}

function Problem({
	title,
	children,
	className,
	role,
}: {
	title: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	/** Defaults to "alert"; pass "note" for problems that are part of the page. */
	role?: "alert" | "note";
}) {
	return (
		<Alert
			variant="destructive"
			className={cn("max-w-[72ch]", className)}
			role={role ?? "alert"}
		>
			<CircleAlertIcon aria-hidden />
			<AlertTitle className="line-clamp-none wrap-anywhere">{title}</AlertTitle>
			<AlertDescription>{children}</AlertDescription>
		</Alert>
	);
}

function Headline({
	rows,
	filters,
	setStatus,
}: {
	rows: Row[];
	filters: Filters;
	setStatus: (s: Status | "") => void;
}) {
	const all: { status: Status; count: number; text: string }[] = [
		{
			status: "outdated",
			count: countBy(rows, "outdated"),
			text: "are outdated",
		},
		{
			status: "edited",
			count: countBy(rows, "edited"),
			text: "were edited after install",
		},
		{
			status: "drift",
			count: countBy(rows, "drift"),
			text: "have copies that differ",
		},
		{
			status: "warnings",
			count: countBy(rows, "warnings"),
			text: "have broken frontmatter",
		},
	];
	const parts = all.filter((p) => p.count > 0);

	const figure = (status: Status | "", label: string, meaning: string) => (
		<button
			type="button"
			className={cn(
				"cursor-pointer rounded px-[0.12em] font-semibold underline decoration-2 underline-offset-[0.18em] hover:decoration-current",
				status ? STATUS_TEXT[status] : "text-ink",
				status && filters.status === status
					? "bg-current/12 decoration-current"
					: "decoration-current/35",
			)}
			aria-pressed={status ? filters.status === status : undefined}
			aria-label={
				status
					? `${label} ${meaning}. ${filters.status === status ? "Showing only these; press to show all." : "Press to show only these."}`
					: `${label}. Press to show all.`
			}
			onClick={() => setStatus(filters.status === status ? "" : status)}
		>
			{label}
		</button>
	);

	return (
		<h1 className={cn(HEADLINE, "mt-7 mb-7 wide:mt-10")}>
			{figure("", `${rows.length} skills`, "")} on this machine.
			{parts.length === 0 ? (
				" Nothing needs attention."
			) : (
				<>
					{" "}
					{parts.map((p, i) => (
						<span key={p.status}>
							{i > 0 && (i === parts.length - 1 ? " and " : ", ")}
							{figure(p.status, String(p.count), p.text)} {p.text}
						</span>
					))}
					.
				</>
			)}
		</h1>
	);
}

const PRESENCE_TEXT: Record<Presence, string> = {
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

function Cell({ presence, root }: { presence: Presence; root?: string }) {
	if (!root)
		return <span className={PRESENCE_CELL[presence]} aria-hidden="true" />;
	const text = `${PRESENCE_TEXT[presence]} in ${rootLabel(root)}`;
	return (
		<Hint text={text}>
			<span className={PRESENCE_CELL[presence]}>
				<span className="sr-only">{text}</span>
			</span>
		</Hint>
	);
}

function SkillList({
	rows,
	summary,
	filters,
	setFilters,
}: {
	rows: Row[];
	summary: InventorySummary;
	filters: Filters;
	setFilters: (f: Filters | ((f: Filters) => Filters)) => void;
}) {
	const search = useRef<HTMLInputElement>(null);
	const set = (patch: Partial<Filters>) =>
		setFilters((f) => ({ ...f, ...patch }));
	const visible = filterRows(rows, filters);
	const roots = summary.roots.filter((r) => r.present);
	const sources = [...new Set(rows.flatMap((r) => r.sources))].sort();

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const typing =
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLSelectElement;
			if (e.key === "/" && !typing) {
				e.preventDefault();
				search.current?.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const filtered = Boolean(
		filters.query || filters.source || filters.root || filters.status,
	);

	return (
		<section>
			<Headline
				rows={rows}
				filters={filters}
				setStatus={(status) => set({ status })}
			/>

			<div className="mb-3.5 flex flex-wrap items-center gap-2">
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
				<Select
					// Radix Select can't use "" as an item value; ANY stands for no filter.
					value={filters.source || ANY}
					onValueChange={(v) => set({ source: v === ANY ? "" : v })}
				>
					<SelectTrigger aria-label="Installed by">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ANY}>Installed by anything</SelectItem>
						{sources.map((s) => (
							<SelectItem key={s} value={s}>
								{SOURCE_LABEL[s] ?? s}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={filters.sort}
					onValueChange={(v) => set({ sort: v as Filters["sort"] })}
				>
					<SelectTrigger aria-label="Sort">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="attention">Needs attention first</SelectItem>
						<SelectItem value="name">A to Z</SelectItem>
					</SelectContent>
				</Select>
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
			</div>

			<Legend />

			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr>
							<th scope="col" className={cn(CELL.headSkill, "w-[46%]")}>
								{visible.length === rows.length
									? "Skill"
									: `${visible.length} of ${rows.length} skills`}
							</th>
							{roots.map((r) => (
								<th key={r.id} scope="col" className={CELL.headLoc}>
									<Hint
										text={`${r.path} holds ${r.entries} skills. ${filters.root === r.id ? "Showing only these; press to show all." : "Press to show only these."}`}
									>
										<button
											type="button"
											className={cn(
												"cursor-pointer rounded px-1 py-0.5 hover:text-ink",
												filters.root === r.id &&
													"bg-raised text-ink shadow-[inset_0_-2px_0_var(--ink)]",
											)}
											aria-pressed={filters.root === r.id}
											onClick={() =>
												set({ root: filters.root === r.id ? "" : r.id })
											}
										>
											{rootLabel(r.id)}
										</button>
									</Hint>
								</th>
							))}
							<th scope="col" className={CELL.headState}>
								State
							</th>
						</tr>
					</thead>
					<tbody>
						{visible.map((r) => (
							<tr key={r.name} className="hover:bg-raised">
								<th scope="row" className={cn(CELL.bodySkill, "w-[46%]")}>
									<a
										className="font-mono text-small font-semibold no-underline hover:underline"
										href={`#/skill/${encodeURIComponent(r.name)}`}
									>
										{r.name}
									</a>
									<span className={DESC}>{r.description}</span>
								</th>
								{roots.map((root) => (
									<td key={root.id} className={CELL.bodyLoc}>
										<Cell
											presence={r.presence[root.id] ?? "absent"}
											root={root.id}
										/>
									</td>
								))}
								<td className={CELL.bodyState}>
									{r.statuses.map((s) => {
										const Icon = STATUS_ICON[s];
										return (
											<span
												key={s}
												className={cn(
													"flex items-center gap-1.5 text-caption font-medium whitespace-nowrap",
													STATUS_TEXT[s],
												)}
											>
												<Icon aria-hidden className="size-3.5 shrink-0" />
												{STATUS_LABEL[s]}
											</span>
										);
									})}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{visible.length === 0 && (
				<p className="my-4 text-ink-soft">
					No skills match. Try a shorter search, or clear the filters.
				</p>
			)}
		</section>
	);
}

function Legend() {
	const kinds: Presence[] = ["folder", "link", "differs", "absent"];
	return (
		<p className="mb-2 flex flex-wrap gap-x-5 gap-y-1.5 text-caption text-ink-soft">
			{kinds.map((k) => (
				<span key={k} className="inline-flex items-center gap-1.75">
					<Cell presence={k} /> {PRESENCE_TEXT[k].toLowerCase()}
				</span>
			))}
		</p>
	);
}

type CopyState = "idle" | "copied" | "failed";

function CopyButton({ text }: { text: string }) {
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
			<Hint text="Copy command">
				<Button
					variant="ghost"
					size="icon-sm"
					className={
						state === "failed" ? "text-problem" : "text-ink-soft hover:text-ink"
					}
					aria-label="Copy command"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(text);
							show("copied", 1500);
						} catch {
							// Clipboard access can be denied (permissions, embedded
							// browsers). Say so; the command is still selectable.
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
						? "Couldn't copy. Select the command and copy it instead."
						: ""}
			</span>
		</>
	);
}

function shortRepo(url: string): string {
	return url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
}

function Advice({ skill, row }: { skill: SkillRecord; row?: Row }) {
	const items: {
		key: string;
		icon: LucideIcon;
		/** Text colour for the icon. */
		tone: string;
		text: string;
		command?: string;
	}[] = [];
	for (const u of row?.upstream ?? []) {
		const command = updateCommand(u, skill.name);
		if (command) {
			items.push({
				key: `up-${u.copy}-${u.via}`,
				icon: STATUS_ICON.outdated,
				tone: STATUS_TEXT.outdated,
				text: `${shortRepo(u.repo)} has a newer version. To update:`,
				command,
			});
		}
		if (u.status === "error") {
			items.push({
				key: `err-${u.copy}`,
				icon: CircleAlertIcon,
				tone: "text-problem",
				text: `Couldn't check for updates: ${u.error}`,
			});
		}
	}
	const edited = row?.statuses.includes("edited");
	if (edited && row?.statuses.includes("outdated")) {
		items.push({
			key: "edited-outdated",
			icon: STATUS_ICON.edited,
			tone: STATUS_TEXT.edited,
			text: "You edited this skill after installing it. Updating replaces those edits, so save anything you want to keep first.",
		});
	} else if (edited) {
		items.push({
			key: "edited",
			icon: STATUS_ICON.edited,
			tone: STATUS_TEXT.edited,
			text: "You edited this skill after installing it. The next update will replace those edits.",
		});
	}
	if (skill.drift) {
		items.push({
			key: "drift",
			icon: STATUS_ICON.drift,
			tone: STATUS_TEXT.drift,
			text: "Agents reading different locations see different versions of this skill. Compare the copies below.",
		});
	}
	if (items.length === 0) return null;
	return (
		<Notes>
			{items.map(({ key, icon: Icon, tone, text, command }) => (
				<li key={key} className="flex gap-2.5">
					<Icon aria-hidden className={cn("mt-1 size-4 shrink-0", tone)} />
					<div className="min-w-0">
						{text}
						{command && (
							<div className="mt-2 flex flex-wrap items-center gap-2">
								<code className="max-w-full overflow-x-auto rounded-md border border-rule bg-paper px-2.5 py-1.5 font-mono text-caption whitespace-nowrap">
									{command}
								</code>
								<CopyButton text={command} />
							</div>
						)}
					</div>
				</li>
			))}
		</Notes>
	);
}

function SkillDetail({
	skill,
	row,
	summary,
}: {
	skill: SkillRecord;
	row?: Row;
	summary: InventorySummary;
}) {
	const roots = summary.roots.filter((r) => r.present);
	const main = [...skill.copies].sort(
		(a, b) => b.seenIn.length - a.seenIn.length,
	)[0];
	return (
		<article>
			<p className="mt-7 text-small">
				<a href="#/" className="inline-flex items-center gap-1.5">
					<ArrowLeftIcon aria-hidden className="size-3.5" />
					All skills
				</a>
			</p>
			<h1 className="mt-2.5 mb-1.5 font-mono text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] wrap-break-word">
				{skill.name}
			</h1>
			<p className="mb-6 max-w-[68ch] text-ink-soft">{skill.description}</p>

			<Advice skill={skill} row={row} />

			<h2 className={H2}>Where it lives</h2>
			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr>
							<th scope="col" className={CELL.headSkill}>
								Folder on disk
							</th>
							{roots.map((r) => (
								<th key={r.id} scope="col" className={CELL.headLoc}>
									<span className="inline-block px-1 py-0.5">
										{rootLabel(r.id)}
									</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{skill.copies.map((c, i) => (
							<tr key={c.realPath} className="hover:bg-raised">
								<th scope="row" className={CELL.bodySkill}>
									<Path>{c.realPath}</Path>
									<span className={DESC}>
										Copy {i + 1}, {c.fileCount}{" "}
										{c.fileCount === 1 ? "file" : "files"},{" "}
										{(c.bytes / 1024).toFixed(1)} KB
										{c.installState === "modified" && ", edited after install"}
									</span>
								</th>
								{roots.map((r) => {
									const e = c.seenIn.find((s) => s.root === r.id);
									const p: Presence = !e
										? "absent"
										: c.hash !== main?.hash
											? "differs"
											: e.symlink
												? "link"
												: "folder";
									return (
										<td key={r.id} className={CELL.bodyLoc}>
											<Cell presence={p} root={r.id} />
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<h2 className={H2}>Installed by</h2>
			<dl className="max-w-[80ch]">
				{skill.copies.flatMap((c, i) =>
					c.provenance.map((p) => (
						<div key={`${c.realPath}-${p.kind}`} className={FACT}>
							<dt className="text-ink-soft">
								{SOURCE_LABEL[p.kind] ?? p.kind}
							</dt>
							<dd className="wrap-break-word">
								<ProvenanceText p={p} />
								{skill.copies.length > 1 && (
									<span className="text-ink-soft"> (copy {i + 1})</span>
								)}
							</dd>
						</div>
					)),
				)}
				{skill.copies.every((c) => c.provenance.length === 0) && (
					<div className={FACT}>
						<dt className="text-ink-soft">Untracked</dt>
						<dd className="text-ink-soft">
							No installer recorded this skill, so it can't be checked for
							updates.
						</dd>
					</div>
				)}
			</dl>

			{skill.copies.some((c) => c.diagnostics.length > 0) && (
				<>
					<h2 className={H2}>Problems</h2>
					<div className="grid max-w-[72ch] gap-2">
						{skill.copies
							.filter((c) => c.diagnostics.length > 0)
							.map((c) => (
								// Part of the page, not a live event: don't interrupt a
								// screen reader the way role="alert" would.
								<Problem
									key={c.realPath}
									role="note"
									title={<Path>{c.realPath}</Path>}
								>
									<ul>
										{c.diagnostics.map((d) => (
											<li key={d}>{d}</li>
										))}
									</ul>
								</Problem>
							))}
					</div>
				</>
			)}

			{skill.versions > 1 && <DiffView skill={skill} />}
		</article>
	);
}

function ProvenanceText({
	p,
}: {
	p: SkillRecord["copies"][number]["provenance"][number];
}) {
	switch (p.kind) {
		case "skill-lock":
			return (
				<>
					<Path>{p.source}</Path>
					{p.updatedAt && (
						<span className="text-ink-soft">
							, last updated {new Date(p.updatedAt).toLocaleDateString()}
						</span>
					)}
				</>
			);
		case "gh-frontmatter":
			return (
				<Path>
					{p.repo}
					{p.ref ? `@${p.ref}` : ""}
				</Path>
			);
		case "git-checkout":
			return (
				<>
					<Path>{p.remote ?? p.repoRoot}</Path>
					<span className="text-ink-soft">
						, branch {p.branch}, commit <Path>{p.head.slice(0, 8)}</Path>
					</span>
				</>
			);
		case "skills-manager":
			return (
				<>
					{p.sourceType === "import" ? "Imported" : p.sourceType}
					{p.sourceRef && (
						<>
							{" "}
							from <Path>{p.sourceRef}</Path>
						</>
					)}
				</>
			);
		case "claude-plugin":
			return (
				<>
					<Path>{p.plugin}</Path>
					{p.version && (
						<span className="text-ink-soft">, version {p.version}</span>
					)}
				</>
			);
		case "claude-app-synced":
			return <>Synced by the Claude desktop app</>;
	}
}

function DiffView({ skill }: { skill: SkillRecord }) {
	const [a, setA] = useState(0);
	const [b, setB] = useState(() =>
		Math.max(
			1,
			skill.copies.findIndex((c) => c.hash !== skill.copies[0]?.hash),
		),
	);
	const [diff, setDiff] = useState<CopyDiff | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (a === b) {
			// oxlint-disable-next-line react/set-state-in-effect -- clears the previous pair's diff.
			setDiff(null);
			return;
		}
		getJson<CopyDiff>(
			`/api/skills/${encodeURIComponent(skill.name)}/diff?a=${a}&b=${b}`,
		)
			.then((d) => {
				setDiff(d);
				setError(null);
			})
			.catch((e: Error) => setError(e.message));
	}, [skill.name, a, b]);

	const pick = (
		value: number,
		onChange: (n: number) => void,
		label: string,
	) => (
		<Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
			<SelectTrigger aria-label={label} className="max-w-full">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{skill.copies.map((c, i) => (
					<SelectItem key={c.realPath} value={String(i)}>
						Copy {i + 1}: <Path>{c.realPath}</Path>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	return (
		<>
			<h2 className={H2}>Compare copies</h2>
			<div className="mb-3.5 flex flex-wrap items-center gap-2">
				{pick(a, setA, "Compare")} <span className="text-ink-soft">with</span>{" "}
				{pick(b, setB, "With")}
			</div>
			{a === b && (
				<p className="my-4 text-ink-soft">Pick two different copies.</p>
			)}
			{error && (
				<Problem className="my-4" title="Couldn't compare these copies">
					{error}
				</Problem>
			)}
			{diff && diff.files.length === 0 && (
				<p className="my-4 text-ink-soft">These two copies are identical.</p>
			)}
			{diff?.files.map((f) => (
				<section key={f.path}>
					<h3 className="mt-5 mb-1.5 flex flex-wrap items-center gap-x-1.5 text-small font-medium">
						<FileIcon status={f.status} />
						<Path>{f.path}</Path>
						<span className="text-ink-soft">
							{f.status === "changed"
								? "changed"
								: f.status === "only-left"
									? `only in copy ${a + 1}`
									: `only in copy ${b + 1}`}
							{f.binary ? ", too large or binary to show" : ""}
						</span>
					</h3>
					{f.patch && <Patch text={f.patch} />}
				</section>
			))}
		</>
	);
}

type FileStatus = CopyDiff["files"][number]["status"];

const FILE_ICON: Record<FileStatus, LucideIcon> = {
	changed: FileDiffIcon,
	"only-left": FileMinusIcon,
	"only-right": FilePlusIcon,
};

/** Decorative: the text after the path already says how the file differs. */
function FileIcon({ status }: { status: FileStatus }) {
	const Icon = FILE_ICON[status];
	return <Icon aria-hidden className="size-3.5 shrink-0 text-ink-soft" />;
}

function Patch({ text }: { text: string }) {
	// Key each line by its character offset: unique and stable for a given patch.
	let offset = 0;
	const lines = text
		.split("\n")
		.slice(4)
		.map((line) => {
			const key = offset;
			// oxlint-disable-next-line react/immutability -- a local counter during render, not state.
			offset += line.length + 1;
			return { key, line };
		});
	return (
		<pre className="overflow-x-auto rounded-md border border-rule bg-raised py-2 font-mono text-code leading-normal">
			{lines.map(({ key, line }) => (
				<span
					key={key}
					className={cn(
						"block px-3.5 whitespace-pre-wrap wrap-anywhere",
						line.startsWith("+")
							? "bg-add"
							: line.startsWith("-")
								? "bg-del"
								: line.startsWith("@@") && "text-ink-soft",
					)}
				>
					{line}
					{"\n"}
				</span>
			))}
		</pre>
	);
}
