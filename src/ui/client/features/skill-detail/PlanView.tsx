import { BusySpinner, Notes, Path } from "@/components/display";
import { Problem } from "@/components/problem";
import { Button } from "@/components/ui/button";
import { AGENTS, type AgentId, type Op, type Plan } from "@/lib/core";
import { plural } from "@/lib/format";

const VERB: Record<Op["kind"], string> = {
	create: "Create",
	keep: "Keep",
	recreate: "Rewrite",
	record: "Record",
	takeover: "Replace",
	remove: "Remove",
	forget: "Forget",
};

const label = (id: AgentId) => AGENTS.find((a) => a.id === id)?.label ?? id;

/** Why an op matters, beyond its verb and path. */
function opNote(op: Op): string | null {
	switch (op.kind) {
		case "takeover":
			return "another tool's link; put back when you undeploy";
		case "remove":
			return op.restore ? `puts back the link to ${op.restore}` : null;
		case "forget":
			return "no longer ours on disk; dropped from the record only";
		case "recreate":
			return "switches between symlink and copy";
		case "record":
			return "already links to the build; added to the record";
		default:
			return null;
	}
}

/**
 * A deployment plan before it's applied (ADR-022): every write, what can't
 * be reached and why, and warnings. Nothing is written until Apply.
 */
export function PlanView({
	plan,
	applying,
	onApply,
	onCancel,
}: {
	plan: Plan;
	applying: boolean;
	onApply: () => void;
	onCancel: () => void;
}) {
	const changes = plan.ops.filter((o) => o.kind !== "keep");
	const kept = plan.ops.length - changes.length;
	const title =
		plan.agents.length === 0
			? "Undeploy everywhere"
			: `Deploy for ${plan.agents.map(label).join(", ")} (${plan.mode})`;
	return (
		<section
			aria-label="Plan"
			className="mt-4 rounded-md border border-rule bg-paper p-4"
		>
			<h3 className="font-medium">{title}</h3>
			{changes.length > 0 ? (
				<ul className="mt-2 grid gap-1.5 text-small">
					{changes.map((op) => {
						const note = opNote(op);
						return (
							<li key={`${op.kind}:${op.entry}`} className="wrap-anywhere">
								<span className="inline-block w-[4.5rem] font-medium">
									{VERB[op.kind]}
								</span>
								<Path>{op.entry}</Path>
								{note && <span className="text-ink-soft"> ({note})</span>}
							</li>
						);
					})}
				</ul>
			) : (
				<p className="mt-2 text-small text-ink-soft">Nothing to change.</p>
			)}
			{kept > 0 && (
				<p className="mt-1.5 text-caption text-ink-soft">
					{plural(kept, "entry", "entries")} already in place.
				</p>
			)}

			{plan.blocked.map((b) => (
				<Problem
					key={b.agent}
					role="note"
					className="mt-3"
					title={`Can't reach ${label(b.agent)}`}
				>
					<ul>
						{b.reasons.map((r) => (
							<li key={r} className="wrap-anywhere">
								{r}
							</li>
						))}
					</ul>
				</Problem>
			))}
			{plan.warnings.length > 0 && (
				<div className="mt-3">
					<Notes>
						{plan.warnings.map((w) => (
							<li key={w} className="text-small">
								{w}
							</li>
						))}
					</Notes>
				</div>
			)}
			{plan.needsConfirmation && (
				<p className="mt-3 max-w-reading text-small">
					This replaces another tool's link. skillctx records what it pointed at
					and puts it back when you undeploy.
				</p>
			)}

			<div className="mt-4 flex flex-wrap gap-2">
				{changes.length > 0 && (
					<Button disabled={applying} onClick={onApply}>
						{applying && <BusySpinner />}
						{applying
							? "Applying…"
							: plan.needsConfirmation
								? "Replace and apply"
								: `Apply ${plural(changes.length, "change")}`}
					</Button>
				)}
				<Button variant="outline" disabled={applying} onClick={onCancel}>
					{changes.length > 0 ? "Cancel" : "Close"}
				</Button>
			</div>
		</section>
	);
}
