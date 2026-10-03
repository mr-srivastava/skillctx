import { parseArgs } from "node:util";
import {
	AGENT_IDS,
	type AgentId,
	agentLabel,
	isAgentId,
} from "../../core/deploy/agents.ts";
import { applyPlan, planDeploy } from "../../core/deploy/apply.ts";
import type { Op, Plan } from "../../core/deploy/plan.ts";
import {
	entryState,
	linkTarget,
	readRecord,
} from "../../core/deploy/record.ts";
import { buildDir } from "../../core/library/format.ts";
import { fromPortable, toPortable } from "../../core/paths.ts";
import {
	type Env,
	resolveWorkspace,
	type Workspace,
} from "../../core/workspace.ts";
import type { Io } from "../io.ts";

const VERB: Record<Op["kind"], string> = {
	create: "create",
	keep: "keep",
	recreate: "rewrite",
	record: "record",
	takeover: "replace",
	remove: "remove",
	forget: "forget",
};

function printPlan(io: Io, p: Plan, homeDir: string): void {
	const show = (abs: string) => toPortable(abs, homeDir);
	const changes = p.ops.filter((o) => o.kind !== "keep");
	io.out(
		p.agents.length === 0
			? `Undeploy ${p.skill}:`
			: `Deploy ${p.skill} for ${p.agents.map(agentLabel).join(", ")} (${p.mode}):`,
	);
	if (p.ops.length === 0) io.out("  nothing to change");
	for (const op of p.ops) {
		let note = "";
		if (op.kind === "takeover") {
			const target = linkTarget(op.entry);
			note = `  (another tool's link${target ? ` to ${show(target)}` : ""}; restored on undeploy)`;
		} else if (op.kind === "remove" && op.restore) {
			note = `  (puts back the link to ${show(op.restore)})`;
		}
		io.out(`  ${VERB[op.kind].padEnd(7)}  ${show(op.entry)}${note}`);
	}
	for (const b of p.blocked) {
		io.out(`Can't reach ${agentLabel(b.agent)}:`);
		for (const r of b.reasons) io.out(`  ${r.replace(homeDir, "~")}`);
	}
	for (const w of p.warnings) io.out(`Note: ${w.replaceAll(homeDir, "~")}`);
	if (changes.length === 0 && p.ops.length > 0) io.out("Nothing to change.");
}

const STATE_TEXT = {
	ours: "deployed",
	"taken-back": "taken back by another tool",
	missing: "missing (removed outside skillctx)",
} as const;

function listDeployments(io: Io, ws: Workspace, env: Env): number {
	const { deployments } = readRecord(ws);
	if (deployments.length === 0) {
		io.out("Nothing deployed yet.");
		return 0;
	}
	for (const d of deployments) {
		const entry = fromPortable(d.entry, env.homeDir);
		const state = entryState(entry, d, ws.resolve(buildDir(d.skill)));
		const text =
			state in STATE_TEXT
				? STATE_TEXT[state as keyof typeof STATE_TEXT]
				: state;
		io.out(`${d.skill.padEnd(24)}  ${d.entry}  ${d.mode}, ${text}`);
	}
	return 0;
}

function parseAgents(value: string | undefined): AgentId[] | string {
	if (!value) return `--agent is required: ${AGENT_IDS.join(", ")}`;
	const ids = value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const unknown = ids.filter((id) => !isAgentId(id));
	if (unknown.length > 0)
		return `Unknown agent ${unknown.join(", ")}. Choose from ${AGENT_IDS.join(", ")}.`;
	return ids as AgentId[];
}

export async function deployCommand(
	args: string[],
	io: Io,
	env: Env,
	now: () => string = () => new Date().toISOString(),
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			home: { type: "string" },
			agent: { type: "string" },
			"copy-mode": { type: "boolean" },
			replace: { type: "boolean" },
			"dry-run": { type: "boolean" },
		},
		allowPositionals: true,
		strict: true,
	});
	const ws = resolveWorkspace(env, values.home);
	const [skill] = positionals;
	if (!skill) return listDeployments(io, ws, env);
	if (positionals.length > 1) {
		io.err(
			"Deploy one skill at a time: skillctx deploy <skill> --agent <agents>",
		);
		return 2;
	}
	const agents = parseAgents(values.agent);
	if (typeof agents === "string") {
		io.err(agents);
		return 2;
	}
	const p = planDeploy(ws, env.homeDir, {
		skill,
		agents,
		mode: values["copy-mode"] ? "copy" : "symlink",
	});
	return finish(io, ws, env, p, {
		dryRun: Boolean(values["dry-run"]),
		replace: Boolean(values.replace),
		now: now(),
		retry: `skillctx deploy ${skill} --agent ${agents.join(",")}${values["copy-mode"] ? " --copy-mode" : ""} --replace`,
	});
}

export async function undeployCommand(
	args: string[],
	io: Io,
	env: Env,
	now: () => string = () => new Date().toISOString(),
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { home: { type: "string" }, "dry-run": { type: "boolean" } },
		allowPositionals: true,
		strict: true,
	});
	const [skill] = positionals;
	if (!skill || positionals.length > 1) {
		io.err("Usage: skillctx undeploy <skill> [--dry-run]");
		return 2;
	}
	const ws = resolveWorkspace(env, values.home);
	const p = planDeploy(ws, env.homeDir, { skill, agents: [], mode: "symlink" });
	return finish(io, ws, env, p, {
		dryRun: Boolean(values["dry-run"]),
		replace: false,
		now: now(),
		retry: "",
	});
}

function finish(
	io: Io,
	ws: Workspace,
	env: Env,
	p: Plan,
	opts: { dryRun: boolean; replace: boolean; now: string; retry: string },
): number {
	printPlan(io, p, env.homeDir);
	const changes = p.ops.filter((o) => o.kind !== "keep").length;
	if (opts.dryRun || changes === 0) return p.blocked.length > 0 ? 1 : 0;
	if (p.needsConfirmation && !opts.replace) {
		io.err("");
		io.err("This replaces other tools' links. To go ahead, run:");
		io.err(`  ${opts.retry}`);
		return 1;
	}
	const { applied } = applyPlan(ws, env.homeDir, p, {
		confirmTakeover: opts.replace,
		now: opts.now,
	});
	const done = applied.filter((o) => o.kind !== "keep").length;
	io.out(`Done: ${done} change${done === 1 ? "" : "s"}.`);
	return p.blocked.length > 0 ? 1 : 0;
}
