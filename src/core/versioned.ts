import { type Workspace, WorkspaceError } from "./workspace.ts";

/**
 * Plain JSON files that carry a `format` number as their first key, read and
 * written the way ADR-014 set out for the inventory: added fields keep the
 * number, a reader refuses formats newer than it knows, and a writer refuses
 * to overwrite them.
 */
export class FormatError extends WorkspaceError {
	override name = "FormatError";
}

export interface VersionedFile<T> {
	/** Workspace-relative path. */
	path: string;
	/** Highest format this skillctx reads and the one it writes. */
	format: number;
	/** What an absent file reads as. */
	empty: () => T;
}

function tooNew(file: VersionedFile<unknown>, found: number): FormatError {
	return new FormatError(
		`${file.path} uses format ${found}, but this skillctx reads up to ${file.format}. Upgrade skillctx`,
	);
}

/**
 * The file's contents without `format`. Missing or unparseable files read as
 * `empty()`: these files are machine-written, and a broken one is rebuilt by
 * the next write rather than blocking every command.
 */
export function readVersioned<T>(ws: Workspace, file: VersionedFile<T>): T {
	const text = ws.read(file.path);
	if (text === undefined) return file.empty();
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return file.empty();
	}
	if (value === null || typeof value !== "object") return file.empty();
	const { format = 1, ...rest } = value as { format?: number };
	if (format > file.format) throw tooNew(file, format);
	return rest as T;
}

/** Write with `format` first. Refuses to replace a file from a newer skillctx. */
export function writeVersioned<T extends object>(
	ws: Workspace,
	file: VersionedFile<T>,
	value: T,
): boolean {
	readVersioned(ws, file);
	return ws.write(
		file.path,
		`${JSON.stringify({ format: file.format, ...value }, null, 2)}\n`,
	);
}
