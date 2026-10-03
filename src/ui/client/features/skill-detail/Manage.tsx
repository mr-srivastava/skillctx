import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";
import { BusySpinner, Path } from "@/components/display";
import {
	ClaudeLogo,
	CodexLogo,
	CursorLogo,
	GeminiLogo,
	OpenCodeLogo,
} from "@/components/logos";
import { Picker } from "@/components/picker";
import { Problem } from "@/components/problem";
import { Button } from "@/components/ui/button";
import {
	AGENTS,
	type AgentId,
	type DeploymentStatus,
	type DeployMode,
	type LockEntry,
	type Plan,
	type SkillRecord,
} from "@/lib/core";
import { plural } from "@/lib/format";
import { deployedAgents, mainCopy } from "@/lib/model";
import {
	adoptMutation,
	applyMutation,
	deploymentsQuery,
	libraryQuery,
	planMutation,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { copyItems } from "./copy-items.tsx";
import { PlanView } from "./PlanView.tsx";

const AGENT_LOGO: Record<AgentId, ComponentType<SVGProps<SVGSVGElement>>> = {
	claude: ClaudeLogo,
	codex: CodexLogo,
	cursor: CursorLogo,
	gemini: GeminiLogo,
	opencode: OpenCodeLogo,
};

const STATE_TEXT: Partial<Record<DeploymentStatus["state"], string>> = {
	ours: "deployed",
	"taken-back": "taken back by another tool",
	missing: "missing (removed outside skillctx)",
};

const MODES = [
	{ value: "symlink", label: "Symlink to the build" },
	{ value: "copy", label: "Copy the files" },
] as const;

/** The outcome of the last adopt or apply, shown at the top of the panel. */
interface Notice {
	ok: boolean;
	text: string;
}

/**
 * Bringing a skill under skillctx: adopt it into the library, then deploy it
 * to agents through a plan you review first (ADR-021, ADR-022). `onChanged`
 * rescans after a deploy, so the rest of the page shows the new links.
 */
export function Manage({
	skill,
	onChanged,
}: {
	skill: SkillRecord;
	onChanged: () => void;
}) {
	const library = useQuery(libraryQuery);
	const deployments = useQuery(deploymentsQuery);
	const [notice, setNotice] = useState<Notice | null>(null);
	const error = library.error ?? deployments.error;
	if (error)
		return (
			<Problem className="mb-6" title="The library couldn't be loaded">
				{error.message}
			</Problem>
		);
	if (!library.data || !deployments.data) return null;

	const entry = library.data[skill.name];
	const current = deployedAgents(skill.name, deployments.data);
	return (
		<section
			aria-labelledby="manage-heading"
			className="mb-6 rounded-md border border-rule bg-raised/40 p-4"
		>
			{notice && (
				<p
					role="status"
					className={cn("mb-3 text-small", !notice.ok && "text-problem")}
				>
					{notice.text}
				</p>
			)}
			{entry ? (
				<Deploy
					// Start again from what's deployed whenever that changes.
					key={current.join()}
					skill={skill}
					entry={entry}
					deployments={deployments.data.filter((d) => d.skill === skill.name)}
					current={current}
					setNotice={setNotice}
					onChanged={onChanged}
				/>
			) : (
				<Adopt skill={skill} setNotice={setNotice} />
			)}
		</section>
	);
}

function Adopt({
	skill,
	setNotice,
}: {
	skill: SkillRecord;
	setNotice: (n: Notice | null) => void;
}) {
	const main = mainCopy(skill);
	const [copy, setCopy] = useState(main ? skill.copies.indexOf(main) : 0);
	const adopting = useMutation(adoptMutation(useQueryClient()));
	const adopt = () => {
		setNotice(null);
		adopting.mutate(
			{ name: skill.name, copy },
			{
				onSuccess: () =>
					setNotice({
						ok: true,
						text: `Adopted ${skill.name}. The original is unchanged; deploy it below.`,
					}),
				onError: (e) => setNotice({ ok: false, text: e.message }),
			},
		);
	};
	return (
		<>
			<h2 id="manage-heading" className="font-medium">
				Not in your library
			</h2>
			<p className="mt-1 max-w-reading text-small text-ink-soft">
				Adopting takes a snapshot of this skill into your skillctx library, so
				you can deploy it to any agent. The original stays where it is, and
				nothing changes in your agent folders until you deploy.
			</p>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				{skill.copies.length > 1 && (
					<Picker
						items={copyItems(skill.copies)}
						value={copy}
						onChange={setCopy}
						label="Copy to adopt"
						shrink
					/>
				)}
				<Button disabled={adopting.isPending} onClick={adopt}>
					{adopting.isPending && <BusySpinner />}
					{adopting.isPending ? "Adopting…" : "Adopt"}
				</Button>
			</div>
		</>
	);
}

function Deploy({
	skill,
	entry,
	deployments,
	current,
	setNotice,
	onChanged,
}: {
	skill: SkillRecord;
	entry: LockEntry;
	deployments: DeploymentStatus[];
	current: AgentId[];
	setNotice: (n: Notice | null) => void;
	onChanged: () => void;
}) {
	const [agents, setAgents] = useState<AgentId[]>(current);
	const [mode, setMode] = useState<DeployMode>(
		deployments[0]?.mode ?? "symlink",
	);
	const [plan, setPlan] = useState<Plan | null>(null);
	const planning = useMutation(planMutation);
	const applying = useMutation(applyMutation(useQueryClient()));

	const review = (wanted: AgentId[]) => {
		setNotice(null);
		planning.mutate(
			{ name: skill.name, agents: wanted, mode },
			{
				onSuccess: setPlan,
				onError: (e) => setNotice({ ok: false, text: e.message }),
			},
		);
	};
	const apply = (reviewed: Plan) => {
		applying.mutate(
			{
				name: skill.name,
				plan: reviewed,
				confirmTakeover: reviewed.needsConfirmation,
			},
			{
				onSuccess: (outcome) => {
					if (outcome.status === "changed") {
						setPlan(outcome.plan);
						setNotice({
							ok: false,
							text: "The agent folders changed since this plan was made, so nothing was written. Review the new plan.",
						});
						return;
					}
					const n = outcome.applied.filter((o) => o.kind !== "keep").length;
					setPlan(null);
					setNotice({ ok: true, text: `Done: ${plural(n, "change")}.` });
					onChanged();
				},
				onError: (e) => setNotice({ ok: false, text: e.message }),
			},
		);
	};
	// A plan shown for other choices than the current ones would mislead.
	const choose = (next: AgentId[], nextMode: DeployMode) => {
		setAgents(next);
		setMode(nextMode);
		setPlan(null);
	};
	const toggle = (id: AgentId) =>
		choose(
			agents.includes(id) ? agents.filter((a) => a !== id) : [...agents, id],
			mode,
		);
	const unchanged =
		agents.length === current.length &&
		agents.every((a) => current.includes(a)) &&
		deployments.every((d) => d.mode === mode && d.state === "ours");

	return (
		<>
			<h2 id="manage-heading" className="font-medium">
				In your library
			</h2>
			<p className="mt-1 text-small text-ink-soft">
				Adopted from <Path>{entry.adoptedFrom}</Path>
			</p>

			{deployments.length > 0 && (
				<ul aria-label="Deployments" className="mt-3 grid gap-1 text-small">
					{deployments.map((d) => (
						<li key={d.entry} className="wrap-anywhere">
							<Path>{d.entry}</Path>
							<span className="text-ink-soft">
								{" "}
								· {d.mode} · {STATE_TEXT[d.state] ?? d.state}
							</span>
						</li>
					))}
				</ul>
			)}

			<fieldset className="mt-4">
				<legend className="mb-2 text-caption text-ink-soft">
					Agents that should see it
				</legend>
				<div className="flex flex-wrap gap-2">
					{AGENTS.map(({ id, label }) => {
						const Logo = AGENT_LOGO[id];
						const on = agents.includes(id);
						return (
							<Button
								key={id}
								variant="outline"
								size="sm"
								aria-pressed={on}
								onClick={() => toggle(id)}
								className={cn(
									on
										? "border-ink bg-paper"
										: "text-ink-soft [&_svg]:opacity-50",
								)}
							>
								<Logo aria-hidden />
								{label}
							</Button>
						);
					})}
				</div>
			</fieldset>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<Picker
					items={MODES}
					value={mode}
					onChange={(m) => choose(agents, m)}
					label="How to deploy"
				/>
				<Button
					disabled={planning.isPending || agents.length === 0 || unchanged}
					onClick={() => review(agents)}
				>
					{planning.isPending && <BusySpinner />}
					Review changes
				</Button>
				{deployments.length > 0 && (
					<Button
						variant="outline"
						disabled={planning.isPending}
						onClick={() => {
							choose([], mode);
							review([]);
						}}
					>
						Undeploy everywhere
					</Button>
				)}
			</div>

			{plan && (
				<PlanView
					plan={plan}
					applying={applying.isPending}
					onApply={() => apply(plan)}
					onCancel={() => setPlan(null)}
				/>
			)}
		</>
	);
}
