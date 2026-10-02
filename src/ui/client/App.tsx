import { useCallback, useEffect, useMemo, useState } from "react";
import type { InventorySummary } from "../../core/inventory.ts";
import type { UpstreamReport } from "../../core/upstream/index.ts";
import type { CopyDiff, SkillRecord } from "../data.ts";
import {
	countBy,
	type Filters,
	filterRows,
	NO_FILTERS,
	type Row,
	SOURCE_LABEL,
	STATUS_LABEL,
	type Status,
	toRows,
} from "./model.ts";

interface Data {
	summary: InventorySummary | null;
	upstream: UpstreamReport | null;
	skills: SkillRecord[];
}

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: ${res.status}`);
	return (await res.json()) as T;
}

function readHash(): string | null {
	const m = /^#\/skill\/(.+)$/.exec(window.location.hash);
	return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function useHashRoute(): string | null {
	const [name, setName] = useState(readHash);
	useEffect(() => {
		const onChange = () => setName(readHash());
		window.addEventListener("hashchange", onChange);
		return () => window.removeEventListener("hashchange", onChange);
	}, []);
	return name;
}

export function App() {
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<null | "scan" | "check">(null);
	const [notice, setNotice] = useState<string | null>(null);
	const selected = useHashRoute();

	const load = useCallback(async () => {
		try {
			const [summary, upstream, skills] = await Promise.all([
				getJson<InventorySummary | null>("/api/summary"),
				getJson<UpstreamReport | null>("/api/upstream"),
				getJson<SkillRecord[]>("/api/skills"),
			]);
			setData({ summary, upstream, skills });
			setError(null);
		} catch (e) {
			setError((e as Error).message);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const refresh = async (check: boolean) => {
		setBusy(check ? "check" : "scan");
		setNotice(null);
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
			setNotice(body.message ?? body.error ?? null);
			await load();
		} catch (e) {
			setNotice((e as Error).message);
		} finally {
			setBusy(null);
		}
	};

	const rows = useMemo(
		() => (data ? toRows(data.skills, data.upstream) : []),
		[data],
	);

	if (error)
		return (
			<main className="page">
				<p className="error">Could not load the inventory: {error}</p>
			</main>
		);
	if (!data)
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);
	if (!data.summary) {
		return (
			<main className="page">
				<Header busy={busy} onRefresh={refresh} />
				<p>No inventory yet. Run a scan to build it.</p>
			</main>
		);
	}

	const skill = selected
		? data.skills.find((s) => s.name === selected)
		: undefined;
	return (
		<main className="page">
			<Header busy={busy} onRefresh={refresh} />
			{notice && <p className="notice">{notice}</p>}
			{selected ? (
				skill ? (
					<SkillDetail
						skill={skill}
						row={rows.find((r) => r.name === skill.name)}
					/>
				) : (
					<p>
						No skill named “{selected}”. <a href="#/">Back to all skills</a>
					</p>
				)
			) : (
				<SkillList
					rows={rows}
					summary={data.summary}
					upstream={data.upstream}
				/>
			)}
		</main>
	);
}

function Header({
	busy,
	onRefresh,
}: {
	busy: null | "scan" | "check";
	onRefresh: (check: boolean) => void;
}) {
	return (
		<header className="header">
			<a href="#/" className="brand">
				skillctx
			</a>
			<div className="actions">
				<button
					type="button"
					disabled={busy !== null}
					onClick={() => onRefresh(false)}
				>
					{busy === "scan" ? "Scanning…" : "Rescan"}
				</button>
				<button
					type="button"
					disabled={busy !== null}
					onClick={() => onRefresh(true)}
					title="Compares with GitHub and git remotes (uses the network)"
				>
					{busy === "check" ? "Checking…" : "Check for updates"}
				</button>
			</div>
		</header>
	);
}

function SkillList({
	rows,
	summary,
	upstream,
}: {
	rows: Row[];
	summary: InventorySummary;
	upstream: UpstreamReport | null;
}) {
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const visible = filterRows(rows, filters);
	const sources = [...new Set(rows.flatMap((r) => r.sources))].sort();
	const roots = summary.roots.filter((r) => r.present);
	const set = (patch: Partial<Filters>) =>
		setFilters((f) => ({ ...f, ...patch }));

	const chips: { status: Status | ""; label: string; count: number }[] = [
		{ status: "", label: "All", count: rows.length },
		{ status: "outdated", label: "Outdated", count: countBy(rows, "outdated") },
		{ status: "edited", label: "Edited", count: countBy(rows, "edited") },
		{ status: "drift", label: "Copies differ", count: countBy(rows, "drift") },
		{ status: "warnings", label: "Warnings", count: countBy(rows, "warnings") },
	];

	return (
		<section>
			<p className="muted summary">
				{summary.skills} skills in {summary.copies} folders, seen through{" "}
				{summary.entries} entries across {roots.length} locations.{" "}
				{upstream
					? `Last update check ${new Date(upstream.checkedAt).toLocaleString()}.`
					: "Never checked for updates."}
			</p>
			<fieldset className="chips" aria-label="Filter by status">
				{chips.map((c) => (
					<button
						type="button"
						key={c.label}
						className={filters.status === c.status ? "chip active" : "chip"}
						onClick={() => set({ status: c.status })}
						disabled={c.count === 0 && c.status !== ""}
					>
						{c.label} <span className="count">{c.count}</span>
					</button>
				))}
			</fieldset>
			<div className="filters">
				<input
					type="search"
					placeholder="Search name or description"
					value={filters.query}
					onChange={(e) => set({ query: e.target.value })}
					aria-label="Search skills"
				/>
				<select
					value={filters.source}
					onChange={(e) => set({ source: e.target.value })}
					aria-label="Source"
				>
					<option value="">All sources</option>
					{sources.map((s) => (
						<option key={s} value={s}>
							{SOURCE_LABEL[s] ?? s}
						</option>
					))}
				</select>
				<select
					value={filters.root}
					onChange={(e) => set({ root: e.target.value })}
					aria-label="Location"
				>
					<option value="">All locations</option>
					{roots.map((r) => (
						<option key={r.id} value={r.id}>
							{r.path}
						</option>
					))}
				</select>
			</div>
			<table className="skills">
				<thead>
					<tr>
						<th>Skill</th>
						<th>Source</th>
						<th>Locations</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{visible.map((r) => (
						<tr key={r.name}>
							<td>
								<a
									href={`#/skill/${encodeURIComponent(r.name)}`}
									className="name"
								>
									{r.name}
								</a>
								<div className="desc">{r.description}</div>
							</td>
							<td>
								{r.sources.map((s) => (
									<span key={s} className="tag">
										{SOURCE_LABEL[s] ?? s}
									</span>
								))}
							</td>
							<td className="num" title={r.roots.join(", ")}>
								{r.roots.length}
							</td>
							<td>
								{r.statuses.length === 0 ? (
									<span className="muted">OK</span>
								) : (
									r.statuses.map((s) => (
										<span key={s} className={`badge ${s}`}>
											{STATUS_LABEL[s]}
										</span>
									))
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{visible.length === 0 && (
				<p className="muted">No skills match these filters.</p>
			)}
		</section>
	);
}

function SkillDetail({ skill, row }: { skill: SkillRecord; row?: Row }) {
	return (
		<section>
			<p>
				<a href="#/">← All skills</a>
			</p>
			<h1>{skill.name}</h1>
			<p className="lead">{skill.description}</p>
			<div>
				{(row?.statuses ?? []).map((s) => (
					<span key={s} className={`badge ${s}`}>
						{STATUS_LABEL[s]}
					</span>
				))}
			</div>

			{row && row.upstream.length > 0 && (
				<>
					<h2>Upstream</h2>
					<ul className="plain">
						{row.upstream.map((u) => (
							<li key={`${u.copy}-${u.via}`}>
								<span
									className={`badge ${u.status === "outdated" ? "outdated" : u.status === "error" ? "warnings" : "ok"}`}
								>
									{u.status}
								</span>{" "}
								{u.repo}{" "}
								<span className="muted">
									via {SOURCE_LABEL[u.via] ?? u.via}
								</span>
								{u.error && <div className="error">{u.error}</div>}
								{u.latest && u.status === "outdated" && (
									<div className="muted mono">
										installed {u.installed.slice(0, 10)} → latest{" "}
										{u.latest.slice(0, 10)}
									</div>
								)}
							</li>
						))}
					</ul>
				</>
			)}

			<h2>
				{skill.copies.length === 1
					? "Copy on disk"
					: `${skill.copies.length} copies on disk`}
			</h2>
			{skill.copies.map((c, i) => (
				<article key={c.realPath} className="copy">
					<header>
						<span className="mono">{c.realPath}</span>
						<span className="muted mono" title={c.hash}>
							{" "}
							#{i + 1} · {c.hash.slice(3, 11)} · {c.fileCount} files ·{" "}
							{(c.bytes / 1024).toFixed(1)} KB
						</span>
					</header>
					{c.installState && (
						<p className={c.installState === "modified" ? "warn" : "muted"}>
							{c.installState === "modified"
								? "Edited since it was installed."
								: "Unchanged since install."}
						</p>
					)}
					<ul className="plain">
						{c.provenance.map((p) => (
							<li key={JSON.stringify(p)}>
								<span className="tag">{SOURCE_LABEL[p.kind] ?? p.kind}</span>{" "}
								<ProvenanceText p={p} />
							</li>
						))}
					</ul>
					<details>
						<summary>Visible in {c.seenIn.length} locations</summary>
						<ul className="plain mono">
							{c.seenIn.map((e) => (
								<li key={e.path}>
									{e.path}{" "}
									<span className="muted">
										{e.symlink ? "symlink" : "folder"}
									</span>
								</li>
							))}
						</ul>
					</details>
					{c.diagnostics.length > 0 && (
						<ul className="warn">
							{c.diagnostics.map((d) => (
								<li key={d}>{d}</li>
							))}
						</ul>
					)}
				</article>
			))}

			{skill.versions > 1 && <DiffView skill={skill} />}
		</section>
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
				<span>
					{p.source}
					{p.skillPath ? <span className="muted"> · {p.skillPath}</span> : null}
					{p.updatedAt ? (
						<span className="muted">
							{" "}
							· updated {new Date(p.updatedAt).toLocaleDateString()}
						</span>
					) : null}
				</span>
			);
		case "gh-frontmatter":
			return (
				<span>
					{p.repo}
					{p.ref ? `@${p.ref}` : ""}
				</span>
			);
		case "git-checkout":
			return (
				<span>
					{p.remote ?? p.repoRoot}{" "}
					<span className="muted mono">
						{p.branch} {p.head.slice(0, 8)}
					</span>
				</span>
			);
		case "skills-manager":
			return (
				<span>
					{p.sourceType}
					{p.sourceRef ? (
						<span className="muted"> from {p.sourceRef}</span>
					) : null}
				</span>
			);
		case "claude-plugin":
			return (
				<span>
					{p.plugin}
					{p.version ? ` ${p.version}` : ""}
				</span>
			);
		case "claude-app-synced":
			return <span className="muted">Synced by the Claude desktop app</span>;
	}
}

function DiffView({ skill }: { skill: SkillRecord }) {
	const [a, setA] = useState(0);
	const [b, setB] = useState(() =>
		skill.copies.findIndex((c) => c.hash !== skill.copies[0]?.hash),
	);
	const [diff, setDiff] = useState<CopyDiff | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (a === b || b < 0) return setDiff(null);
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
					#{i + 1} {c.realPath}
				</option>
			))}
		</select>
	);

	return (
		<>
			<h2>What differs between copies</h2>
			<div className="filters">
				{pick(a, setA, "First copy")} <span className="muted">vs</span>{" "}
				{pick(b, setB, "Second copy")}
			</div>
			{error && <p className="error">{error}</p>}
			{diff && diff.files.length === 0 && (
				<p className="muted">These two copies are identical.</p>
			)}
			{diff?.files.map((f) => (
				<div key={f.path} className="file">
					<div className="mono">
						{f.path}{" "}
						<span className="muted">
							{f.status === "changed"
								? "changed"
								: f.status === "only-left"
									? `only in #${a + 1}`
									: `only in #${b + 1}`}
							{f.binary ? " · binary or large" : ""}
						</span>
					</div>
					{f.patch && <Patch text={f.patch} />}
				</div>
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
