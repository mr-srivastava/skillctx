import os from "node:os";
import path from "node:path";

/**
 * Committed workspace files must not contain machine-specific absolute paths
 * (ADR-009), so paths under the user's home directory are stored as `~/...`.
 */
export function toPortable(
	absPath: string,
	homeDir: string = os.homedir(),
): string {
	const rel = path.relative(homeDir, absPath);
	if (rel === "") return "~";
	if (rel.startsWith("..") || path.isAbsolute(rel)) return absPath;
	return `~/${rel.split(path.sep).join("/")}`;
}

export function fromPortable(
	p: string,
	homeDir: string = os.homedir(),
): string {
	if (p === "~") return homeDir;
	if (p.startsWith("~/")) return path.join(homeDir, p.slice(2));
	return path.resolve(p);
}

/** True when `child` is `parent` or sits somewhere below it. */
export function isInside(parent: string, child: string): boolean {
	const rel = path.relative(path.resolve(parent), path.resolve(child));
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
