import { createCn } from "cn/config";

/**
 * Class-name merging: later classes win over conflicting earlier ones.
 * It has to know our role-named sizes (styles.css @theme): otherwise it
 * reads text-caption as a colour and drops text-ink-soft next to it, and
 * can't tell that max-w-full overrides max-w-reading.
 *
 * shadcn components import `cn` from the "cn" package, which doesn't know
 * these sizes. Import from here instead; test/ui.test.ts checks this.
 */
export const cn = createCn({
	extend: {
		classGroups: {
			"font-size": [
				{
					text: [
						"chip",
						"code",
						"caption",
						"small",
						"body",
						"lead",
						"heading",
						"title",
					],
				},
			],
			"max-w": [{ "max-w": ["reading"] }],
		},
	},
});
