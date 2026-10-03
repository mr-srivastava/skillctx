import { skillctxLookup, tallyDeployments } from "../deploy/inventory.ts";
import { gitTreeSha } from "../indexer/git-tree.ts";
import { buildIndex, type Skill } from "../indexer/index.ts";
import { toPortable } from "../paths.ts";
import { installedTree } from "../provenance/kinds.ts";
import {
	claudeAppSyncedLookup,
	claudePluginLookup,
	combine,
	ghFrontmatterLookup,
	gitCheckoutLookup,
	readClaudePlugins,
	skillLockLookup,
	skillsManagerLookup,
} from "../provenance/sources.ts";
import { listPlainSkills } from "../sources/plain.ts";
import {
	BUILTIN_ROOTS,
	configuredRoots,
	PLUGIN_ROOT_PREFIX,
} from "../sources/roots.ts";
import type { SkillRoot } from "../sources/types.ts";
import type { Workspace } from "../workspace.ts";
import { type InventorySummary, sourceKinds } from "./format.ts";

export interface ScanResult {
	skills: Skill[];
	summary: InventorySummary;
}

export function scan(ws: Workspace, homeDir: string): ScanResult {
	const warnings: string[] = [];
	const warn = (msg: string) => warnings.push(msg);
	const plugins = readClaudePlugins(homeDir, warn);
	const pluginRoots: SkillRoot[] = plugins.map((p) => ({
		id: `${PLUGIN_ROOT_PREFIX}${p.plugin}`,
		label: `Claude plugin ${p.plugin}`,
		path: toPortable(`${p.installPath}/skills`, homeDir),
	}));
	const roots: SkillRoot[] = [
		...BUILTIN_ROOTS,
		...pluginRoots,
		...configuredRoots(ws.config().roots),
	];
	const entries = listPlainSkills(roots, homeDir);
	const skills = buildIndex(entries);

	const lookup = combine([
		skillLockLookup(homeDir, warn),
		ghFrontmatterLookup,
		gitCheckoutLookup(homeDir),
		skillsManagerLookup(homeDir, warn),
		claudePluginLookup(plugins),
		claudeAppSyncedLookup(homeDir),
		skillctxLookup(ws, homeDir),
	]);
	for (const skill of skills) {
		for (const copy of skill.copies) {
			copy.provenance = lookup(copy.realPath);
			const recorded = copy.provenance.map(installedTree).find(Boolean);
			if (recorded) {
				copy.installState =
					gitTreeSha(copy.realPath) === recorded ? "unchanged" : "modified";
			}
		}
	}

	const perRoot = new Map<string, number>();
	for (const e of entries)
		perRoot.set(e.rootId, (perRoot.get(e.rootId) ?? 0) + 1);

	const sources: InventorySummary["sources"] = {};
	for (const skill of skills) {
		const kinds = sourceKinds(skill);
		for (const k of kinds.length > 0 ? kinds : (["untracked"] as const)) {
			sources[k] = (sources[k] ?? 0) + 1;
		}
	}

	const summary: InventorySummary = {
		skills: skills.length,
		copies: skills.reduce((n, s) => n + s.copies.length, 0),
		entries: entries.length,
		drifted: skills.filter((s) => s.drift).length,
		modifiedSinceInstall: skills.filter((s) =>
			s.copies.some((c) => c.installState === "modified"),
		).length,
		withDiagnostics: skills.filter((s) =>
			s.copies.some((c) => c.diagnostics.length > 0),
		).length,
		sources: Object.fromEntries(
			Object.entries(sources).sort(([a], [b]) => (a < b ? -1 : 1)),
		),
		roots: roots.map((r) => ({
			id: r.id,
			label: r.label,
			path: r.path,
			present: perRoot.has(r.id),
			entries: perRoot.get(r.id) ?? 0,
		})),
		warnings,
	};
	const deployments = tallyDeployments(ws, homeDir);
	if (deployments) summary.deployments = deployments;
	return { skills, summary };
}
