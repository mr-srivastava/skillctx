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
 * A versioned file's text as its format and the rest of its contents.
 * Undefined when the file is missing or isn't a JSON object. Files without
 * `format` predate it and count as format 1.
 */
export function parseVersioned(
	text: string | undefined,
): { format: number; value: unknown } | undefined {
	if (text === undefined) return undefined;
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (value === null || typeof value !== "object") return undefined;
	const { format = 1, ...rest } = value as { format?: number };
	return { format, value: rest };
}

/** JSON with `format` as the first key. */
export function serializeVersioned(format: number, value: object): string {
	return `${JSON.stringify({ format, ...value }, null, 2)}\n`;
}

/**
 * The file's contents without `format`. Missing or unparseable files read as
 * `empty()`: these files are machine-written, and a broken one is rebuilt by
 * the next write rather than blocking every command.
 */
export function readVersioned<T>(ws: Workspace, file: VersionedFile<T>): T {
	const parsed = parseVersioned(ws.read(file.path));
	if (!parsed) return file.empty();
	if (parsed.format > file.format) throw tooNew(file, parsed.format);
	return parsed.value as T;
}

/** Write with `format` first. Refuses to replace a file from a newer skillctx. */
export function writeVersioned<T extends object>(
	ws: Workspace,
	file: VersionedFile<T>,
	value: T,
): boolean {
	readVersioned(ws, file);
	return ws.write(file.path, serializeVersioned(file.format, value));
}
