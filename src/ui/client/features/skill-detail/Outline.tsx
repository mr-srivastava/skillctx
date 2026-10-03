import { goToAnchor, type Heading } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * The file's headings, for jumping around long skills. Shown beside the text
 * on wide screens only; on narrow ones the text reads top to bottom.
 */
export function Outline({ headings }: { headings: Heading[] }) {
	const inner = headings.filter((h) => h.depth === 2 || h.depth === 3);
	const items = inner.length > 0 ? inner : headings.filter((h) => h.depth <= 3);
	if (items.length < 2) return null;
	const top = Math.min(...items.map((h) => h.depth));
	return (
		<nav
			aria-labelledby="outline-label"
			className="sticky top-4 hidden max-h-[calc(100vh-2rem)] self-start overflow-y-auto split:block"
		>
			<h2
				id="outline-label"
				className="mb-2 text-caption font-medium text-ink-soft"
			>
				On this page
			</h2>
			<ul className="border-l border-rule">
				{items.map((h) => (
					<li key={h.id}>
						<button
							type="button"
							className={cn(
								"-ml-px block w-full cursor-pointer border-l border-transparent py-1 pr-1 text-left text-small leading-snug text-ink-soft hover:border-ink hover:text-ink",
								h.depth > top ? "pl-6" : "pl-3",
							)}
							onClick={() => goToAnchor(h.id)}
						>
							{h.text}
						</button>
					</li>
				))}
			</ul>
		</nav>
	);
}
