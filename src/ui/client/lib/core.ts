/*
 * Everything the page uses from core/ and the UI server, in one place. The
 * rest of the client imports these from "@/lib/core", never by a relative
 * path out of src/ui/client (test/ui.test.ts checks). Values here run in the
 * browser, so the core modules they come from must not import node: modules
 * (also checked there).
 */

export {
	AGENTS,
	type AgentId,
	foldersOf,
} from "../../../core/deploy/agents.ts";
export type { Op, Plan } from "../../../core/deploy/plan.ts";
export type { DeployMode } from "../../../core/deploy/record.ts";
export type { AdoptResult } from "../../../core/library/adopt.ts";
export type { LockEntry } from "../../../core/library/format.ts";
export type {
	DeploymentStatus,
	ReviewedOutcome,
} from "../../../core/ops/deployments.ts";
export type {
	CopyRecord,
	InventorySummary,
	RootSummary,
	SkillRecord,
} from "../../../core/inventory/format.ts";
export {
	provenanceDetails,
	sourceLabel,
	updateCommand,
} from "../../../core/provenance/kinds.ts";
export type { Provenance } from "../../../core/provenance/types.ts";
export {
	BUILTIN_ROOTS,
	PLUGIN_ROOT_PREFIX,
	rootLabel,
} from "../../../core/sources/roots.ts";
export type {
	UpstreamReport,
	UpstreamResult,
} from "../../../core/upstream/index.ts";
export type { CopyDiff, CopyFiles, FileText } from "../../../core/ops/files.ts";
export type { RefreshResult } from "../../server.ts";
