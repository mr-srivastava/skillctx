import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
			<main className="page">
				{bar}
				<p className="problem">
					The inventory couldn't be loaded: {loadError}. Restart `skillctx ui`
					and reload this page.
				</p>
			</main>
		);
	}
	if (!data) {
		return (
			<main className="page">
				{bar}
				<p className="quiet">Loading the inventory…</p>
			</main>
		);
	}
	if (!data.summary) {
		return (
			<main className="page">
				{bar}
				<section className="empty">
					<h1 className="headline">No inventory yet</h1>
					<p>
						Scan your skill folders to see every skill on this machine and where
						it lives.
					</p>
					<button
						type="button"
						className="primary"
						disabled={busy !== null}
						onClick={() => refresh(false)}
					>
						{busy ? "Scanning…" : "Scan now"}
					</button>
				</section>
			</main>
		);
	}

	const skill = selected
		? data.skills.find((s) => s.name === selected)
		: undefined;

	return (
		<main className="page">
			{bar}
			{selected ? (
				skill ? (
					<SkillDetail
						skill={skill}
						row={rows.find((r) => r.name === skill.name)}
						summary={data.summary}
					/>
				) : (
					<p className="problem">
						There's no skill named “{selected}” in the inventory.{" "}
						<a href="#/">Show all skills</a>
					</p>
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
		<header className="topbar">
			<a href="#/" className="wordmark">
				skillctx
			</a>
			<div className="topbar-actions">
				<span className="checked">
					{busy === "check"
						? "Asking GitHub and git remotes…"
						: busy === "scan"
							? "Scanning skill folders…"
							: upstream
								? `Checked for updates ${when(upstream.checkedAt)}`
								: "Not checked for updates yet"}
				</span>
				<button
					type="button"
					disabled={busy !== null}
					onClick={() => onRefresh(false)}
					title="Re-read every skill folder on this machine"
				>
					Rescan
				</button>
				<button
					type="button"
					className="primary"
					disabled={busy !== null}
					onClick={() => onRefresh(true)}
					title="Rescan, then compare with GitHub and git remotes. Uses the network."
				>
					Check for updates
				</button>
			</div>
			{result && (
				<p
					className={result.ok ? "result" : "result problem"}
					role="status"
					aria-live="polite"
				>
					{result.text}
				</p>
			)}
		</header>
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
			className={`figure ${status || "all"}${status && filters.status === status ? " on" : ""}`}
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
		<h1 className="headline">
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

function Cell({ presence, root }: { presence: Presence; root?: string }) {
	if (!root) return <span className={`cell ${presence}`} aria-hidden="true" />;
	const text = `${PRESENCE_TEXT[presence]} in ${rootLabel(root)}`;
	return (
		<span className={`cell ${presence}`} title={text}>
			<span className="sr">{text}</span>
		</span>
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

			<div className="controls">
				<input
					ref={search}
					type="search"
					placeholder="Find a skill  ( / )"
					value={filters.query}
					onChange={(e) => set({ query: e.target.value })}
					aria-label="Find a skill by name or description"
				/>
				<select
					value={filters.source}
					onChange={(e) => set({ source: e.target.value })}
					aria-label="Installed by"
				>
					<option value="">Installed by anything</option>
					{sources.map((s) => (
						<option key={s} value={s}>
							{SOURCE_LABEL[s] ?? s}
						</option>
					))}
				</select>
				<select
					value={filters.sort}
					onChange={(e) => set({ sort: e.target.value as Filters["sort"] })}
					aria-label="Sort"
				>
					<option value="attention">Needs attention first</option>
					<option value="name">A to Z</option>
				</select>
				{filtered && (
					<button
						type="button"
						className="plain"
						onClick={() => setFilters({ ...NO_FILTERS, sort: filters.sort })}
					>
						Clear filters
					</button>
				)}
			</div>

			<Legend />

			<div className="grid-wrap">
				<table className="grid">
					<thead>
						<tr>
							<th scope="col" className="skill-col">
								{visible.length === rows.length
									? "Skill"
									: `${visible.length} of ${rows.length} skills`}
							</th>
							{roots.map((r) => (
								<th key={r.id} scope="col" className="loc">
									<button
										type="button"
										className={filters.root === r.id ? "loc-btn on" : "loc-btn"}
										aria-pressed={filters.root === r.id}
										title={`${r.path} holds ${r.entries} skills. ${filters.root === r.id ? "Showing only these; press to show all." : "Press to show only these."}`}
										onClick={() =>
											set({ root: filters.root === r.id ? "" : r.id })
										}
									>
										{rootLabel(r.id)}
									</button>
								</th>
							))}
							<th scope="col" className="state-col">
								State
							</th>
						</tr>
					</thead>
					<tbody>
						{visible.map((r) => (
							<tr key={r.name}>
								<th scope="row" className="skill-col">
									<a
										className="skill-name"
										href={`#/skill/${encodeURIComponent(r.name)}`}
									>
										{r.name}
									</a>
									<span className="skill-desc">{r.description}</span>
								</th>
								{roots.map((root) => (
									<td key={root.id} className="loc">
										<Cell
											presence={r.presence[root.id] ?? "absent"}
											root={root.id}
										/>
									</td>
								))}
								<td className="state-col">
									{r.statuses.map((s) => (
										<span key={s} className={`state ${s}`}>
											{STATUS_LABEL[s]}
										</span>
									))}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{visible.length === 0 && (
				<p className="quiet">
					No skills match. Try a shorter search, or clear the filters.
				</p>
			)}
		</section>
	);
}

function Legend() {
	const kinds: Presence[] = ["folder", "link", "differs", "absent"];
	return (
		<p className="legend">
			{kinds.map((k) => (
				<span key={k}>
					<Cell presence={k} /> {PRESENCE_TEXT[k].toLowerCase()}
				</span>
			))}
		</p>
	);
}

function CopyButton({ text }: { text: string }) {
	const [done, setDone] = useState(false);
	return (
		<button
			type="button"
			className="plain"
			onClick={async () => {
				await navigator.clipboard.writeText(text);
				setDone(true);
				setTimeout(() => setDone(false), 1500);
			}}
		>
			{done ? "Copied" : "Copy"}
		</button>
	);
}

function shortRepo(url: string): string {
	return url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
}

function Advice({ skill, row }: { skill: SkillRecord; row?: Row }) {
	const items: { key: string; text: string; command?: string }[] = [];
	for (const u of row?.upstream ?? []) {
		const command = updateCommand(u, skill.name);
		if (command) {
			items.push({
				key: `up-${u.copy}-${u.via}`,
				text: `${shortRepo(u.repo)} has a newer version. To update:`,
				command,
			});
		}
		if (u.status === "error") {
			items.push({
				key: `err-${u.copy}`,
				text: `Couldn't check for updates: ${u.error}`,
			});
		}
	}
	const edited = row?.statuses.includes("edited");
	if (edited && row?.statuses.includes("outdated")) {
		items.push({
			key: "edited-outdated",
			text: "You edited this skill after installing it. Updating replaces those edits, so save anything you want to keep first.",
		});
	} else if (edited) {
		items.push({
			key: "edited",
			text: "You edited this skill after installing it. The next update will replace those edits.",
		});
	}
	if (skill.drift) {
		items.push({
			key: "drift",
			text: "Agents reading different locations see different versions of this skill. Compare the copies below.",
		});
	}
	if (items.length === 0) return null;
	return (
		<ul className="advice">
			{items.map((i) => (
				<li key={i.key}>
					{i.text}
					{i.command && (
						<div className="command">
							<code>{i.command}</code>
							<CopyButton text={i.command} />
						</div>
					)}
				</li>
			))}
		</ul>
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
		<article className="detail">
			<p className="back">
				<a href="#/">All skills</a>
			</p>
			<h1 className="detail-name">{skill.name}</h1>
			<p className="detail-desc">{skill.description}</p>

			<Advice skill={skill} row={row} />

			<h2>Where it lives</h2>
			<div className="grid-wrap">
				<table className="grid where">
					<thead>
						<tr>
							<th scope="col" className="skill-col">
								Folder on disk
							</th>
							{roots.map((r) => (
								<th key={r.id} scope="col" className="loc">
									<span className="loc-label">{rootLabel(r.id)}</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{skill.copies.map((c, i) => (
							<tr key={c.realPath}>
								<th scope="row" className="skill-col">
									<span className="path">{c.realPath}</span>
									<span className="skill-desc">
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
										<td key={r.id} className="loc">
											<Cell presence={p} root={r.id} />
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<h2>Installed by</h2>
			<dl className="facts">
				{skill.copies.flatMap((c, i) =>
					c.provenance.map((p) => (
						<div key={`${c.realPath}-${p.kind}`}>
							<dt>{SOURCE_LABEL[p.kind] ?? p.kind}</dt>
							<dd>
								<ProvenanceText p={p} />
								{skill.copies.length > 1 && (
									<span className="quiet"> (copy {i + 1})</span>
								)}
							</dd>
						</div>
					)),
				)}
				{skill.copies.every((c) => c.provenance.length === 0) && (
					<div>
						<dt>Untracked</dt>
						<dd className="quiet">
							No installer recorded this skill, so it can't be checked for
							updates.
						</dd>
					</div>
				)}
			</dl>

			{skill.copies.some((c) => c.diagnostics.length > 0) && (
				<>
					<h2>Problems</h2>
					<ul className="advice problem">
						{skill.copies.flatMap((c) =>
							c.diagnostics.map((d) => (
								<li key={`${c.realPath}-${d}`}>
									{d} in <span className="path">{c.realPath}</span>
								</li>
							)),
						)}
					</ul>
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
					<span className="path">{p.source}</span>
					{p.updatedAt && (
						<span className="quiet">
							, last updated {new Date(p.updatedAt).toLocaleDateString()}
						</span>
					)}
				</>
			);
		case "gh-frontmatter":
			return (
				<span className="path">
					{p.repo}
					{p.ref ? `@${p.ref}` : ""}
				</span>
			);
		case "git-checkout":
			return (
				<>
					<span className="path">{p.remote ?? p.repoRoot}</span>
					<span className="quiet">
						, branch {p.branch}, commit{" "}
						<span className="path">{p.head.slice(0, 8)}</span>
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
							from <span className="path">{p.sourceRef}</span>
						</>
					)}
				</>
			);
		case "claude-plugin":
			return (
				<>
					<span className="path">{p.plugin}</span>
					{p.version && <span className="quiet">, version {p.version}</span>}
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
		<select
			value={value}
			onChange={(e) => onChange(Number(e.target.value))}
			aria-label={label}
		>
			{skill.copies.map((c, i) => (
				<option key={c.realPath} value={i}>
					Copy {i + 1}: {c.realPath}
				</option>
			))}
		</select>
	);

	return (
		<>
			<h2>Compare copies</h2>
			<div className="controls">
				{pick(a, setA, "Compare")} <span className="quiet">with</span>{" "}
				{pick(b, setB, "With")}
			</div>
			{a === b && <p className="quiet">Pick two different copies.</p>}
			{error && <p className="problem">Couldn't compare: {error}</p>}
			{diff && diff.files.length === 0 && (
				<p className="quiet">These two copies are identical.</p>
			)}
			{diff?.files.map((f) => (
				<section key={f.path} className="file">
					<h3>
						<span className="path">{f.path}</span>{" "}
						<span className="quiet">
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

function Patch({ text }: { text: string }) {
	// Key each line by its character offset: unique and stable for a given patch.
	let offset = 0;
	const lines = text
		.split("\n")
		.slice(4)
		.map((line) => {
			const key = offset;
			offset += line.length + 1;
			return { key, line };
		});
	return (
		<pre className="patch">
			{lines.map(({ key, line }) => (
				<span
					key={key}
					className={
						line.startsWith("+")
							? "add"
							: line.startsWith("-")
								? "del"
								: line.startsWith("@@")
									? "hunk"
									: ""
					}
				>
					{line}
					{"\n"}
				</span>
			))}
		</pre>
	);
}
