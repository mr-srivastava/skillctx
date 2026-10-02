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

/**
 * Remove keys given as dotted paths ("metadata.github-repo"). A parent map
 * left empty is removed too, so a copy with injected metadata and a copy
 * without it end up identical.
 */
export function withoutKeys(
	data: Record<string, unknown>,
	keys: ReadonlySet<string>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (keys.has(key)) continue;
		const prefix = `${key}.`;
		const nested = [...keys]
			.filter((k) => k.startsWith(prefix))
			.map((k) => k.slice(prefix.length));
		if (
			nested.length > 0 &&
			value !== null &&
			typeof value === "object" &&
			!Array.isArray(value)
		) {
			const inner = withoutKeys(
				value as Record<string, unknown>,
				new Set(nested),
			);
			if (Object.keys(inner).length > 0) out[key] = inner;
		} else {
			out[key] = value;
		}
	}
	return out;
}

function sortDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortDeep);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value as object)
				.sort()
				.map((k) => [k, sortDeep((value as Record<string, unknown>)[k])]),
		);
	}
	return value;
}

/**
 * Canonical SKILL.md text for hashing: frontmatter parsed, provenance keys
 * removed, keys sorted and serialized as JSON, then the body. Formatting
 * differences in frontmatter (quoting, key order, injected tracking fields)
 * don't change the hash. Unparseable files hash as-is.
 */
export function canonicalSkillMd(
	text: string,
	provenanceKeys: ReadonlySet<string>,
): string {
	const parsed = parseSkillMd(text);
	if (!parsed.ok) return text;
	const data = sortDeep(withoutKeys(parsed.value.data, provenanceKeys));
	return `${JSON.stringify(data)}\n---\n${parsed.value.body}`;
}
