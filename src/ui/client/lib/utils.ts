import { createCn } from "cn/config";

/**
 * Class-name merging: later classes win over conflicting earlier ones.
 * It has to know our role-named text sizes (styles.css @theme), or it reads
 * text-caption as a colour and drops text-ink-soft next to it.
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
		},
	},
});
