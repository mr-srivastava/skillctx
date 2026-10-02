export interface Frontmatter {
	data: Record<string, unknown>;
	/** SKILL.md text after the closing `---`. */
	body: string;
}

export type ParseResult =
	| { ok: true; value: Frontmatter }
	| { ok: false; error: string };

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Split a SKILL.md into YAML frontmatter and body. A file without frontmatter is an error. */
export function parseSkillMd(text: string): ParseResult {
	const match = FENCE.exec(text);
	if (!match) return { ok: false, error: "SKILL.md has no YAML frontmatter" };
	let data: unknown;
	try {
		data = Bun.YAML.parse(match[1] ?? "");
	} catch (error) {
		return {
			ok: false,
			error: `Invalid frontmatter YAML: ${(error as Error).message}`,
		};
	}
	if (data === null || typeof data !== "object" || Array.isArray(data)) {
		return { ok: false, error: "Frontmatter is not a YAML mapping" };
	}
	return {
		ok: true,
		value: {
			data: data as Record<string, unknown>,
			body: text.slice(match[0].length),
		},
	};
}

/** Re-join frontmatter without the given top-level keys. Used only for hashing. */
export function stripKeys(text: string, keys: ReadonlySet<string>): string {
	const parsed = parseSkillMd(text);
	if (!parsed.ok || keys.size === 0) return text;
	const kept = Object.fromEntries(
		Object.entries(parsed.value.data).filter(([k]) => !keys.has(k)),
	);
	if (Object.keys(kept).length === Object.keys(parsed.value.data).length)
		return text;
	return `---\n${Bun.YAML.stringify(kept, null, 2)}\n---\n${parsed.value.body}`;
}
