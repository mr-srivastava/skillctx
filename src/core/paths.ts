import { realpathSync } from "node:fs";
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
	// Real paths come from realpath(), so compare against the real home too
	// (on macOS /var is a symlink to /private/var, and homes can be symlinked).
	for (const base of homeBases(homeDir)) {
		const rel = path.relative(base, absPath);
		if (rel === "") return "~";
		if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
			return `~/${rel.split(path.sep).join("/")}`;
		}
	}
	return absPath;
}

function homeBases(homeDir: string): string[] {
	const real = tryRealpath(homeDir);
	return real === undefined || real === homeDir ? [homeDir] : [homeDir, real];
}

/** The real path, or undefined when it doesn't exist or can't be read. */
export function tryRealpath(p: string): string | undefined {
	try {
		return realpathSync(p);
	} catch {
		return undefined;
	}
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
