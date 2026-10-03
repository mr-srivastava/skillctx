# ADR-018: Syntax highlighting with Shiki, coloured from the page palette

## Status
Accepted. Supersedes ADR-015's "code blocks aren't syntax-highlighted"; the rest of ADR-015 stands.

## Date
2026-10-03

## Context
ADR-015 rendered skill files without syntax highlighting and said to add it if it was missed. It was. Skills are mostly code examples: in one real inventory, a single SKILL.md had 17 fenced blocks and over 480 lines of TypeScript and shell. Skills also ship scripts (`scripts/*.sh`, `*.py`) that the Contents tab shows as plain text. Without colour, long examples are hard to scan.

Constraints from earlier decisions:
- Local-first (ADR-005, ADR-010): grammars can't be fetched from a CDN at runtime.
- Skill files are rendered to React elements from a hast tree, with no `dangerouslySetInnerHTML` (ADR-015). Highlighting has to fit that pipeline.
- Colours come from the palette in `styles.css`, with dark mode via `prefers-color-scheme` (ADR-011).
- Bun's HTML bundler for `Bun.serve` doesn't split code, so every grammar we include is in the page script, whether a page uses it or not.

## Decision
- Use Shiki (`shiki`) with its core build and its JavaScript regex engine (`shiki/core`, `shiki/engine/javascript`). This avoids the Oniguruma WASM binary and the full bundle, which has every language.
- Colour with Shiki's CSS-variables theme (prefix `--code-`). `styles.css` maps each `--code-token-*` to a palette colour (keywords use `--differs`, functions `--outdated`, constants `--edited`, comments and punctuation `--ink-soft`), plus one new colour, `--string`, defined for light and dark. Highlighted code follows the theme switch, and no Shiki theme JSON ships.
- Bundle a small set of grammars: bash, css, diff, json, markdown, python, toml, tsx, yaml. Aliases map common fence names and file extensions onto them (`sh`, `zsh`, `py`, `yml`, `md`, `jsonc`). The `tsx` grammar is a superset of JavaScript, JSX and TypeScript, so `js`, `jsx`, `ts`, `typescript`, `mjs`, `cjs` and `mts` all use it; each separate grammar is about 180 KB. Any other language stays plain.
- What gets highlighted on the Contents tab: fenced code in markdown, a file's frontmatter (as YAML), and non-markdown files whose extension has a grammar.
- `lib/highlight.ts` loads Shiki and each grammar through `import()` the first time a file needs it. Until then, and if loading fails, code renders as plain text, exactly as before. The markdown parse records the languages named on fences, so Contents knows which grammars to load.
- Highlighting runs on a copy of the hast tree: each `pre > code` block's text is replaced by Shiki's line spans, and our own `<pre>` styling stays. Shiki's wrapper `<pre>`, its inline background and its classes are dropped. Shiki's output is spans with `style="color: var(...)"` only, so ADR-015's rendering rules hold: there's still no raw HTML and nothing to sanitize.

## Alternatives Considered

### Shiki's web or full bundle
- Pros: every language works with no alias table
- Cons: the web bundle is about 700 KB gzipped and the full bundle about 1.2 MB, all in the page script because the dev-server bundler doesn't split
- Rejected: skills use a handful of languages

### `react-shiki`
- Pros: a ready-made component and hook
- Cons: it highlights strings, not hast nodes, so it would sit beside the unified pipeline rather than inside it, and it brings its own bundle choices
- Rejected: about 60 lines of our own code fit the existing tree

### highlight.js / lowlight
- Pros: smaller grammars; `rehype-highlight` slots into unified directly
- Cons: regex-based grammars that highlight noticeably worse than TextMate grammars; colours come from class names, which would need a stylesheet per token kind
- Rejected: Shiki's CSS-variables theme maps onto our palette with less CSS and better accuracy

### A bundled Shiki theme (e.g. `github-light` / `github-dark`)
- Pros: tuned colours, no CSS to write
- Cons: two theme files to ship, and colours that don't match the page
- Rejected: the CSS-variables theme reuses the palette

## Consequences
- Adds the `shiki` dependency.
- The UI page script grows from about 930 KB to about 1.5 MB minified, served from localhost. Revisit this if the dev-server bundler gains code splitting, which would load grammars only when needed.
- A new grammar is two lines in `lib/highlight.ts` (an import plus any aliases). Check its size first; anything that pulls in other grammars (`html` pulls in JavaScript and CSS) costs more than it looks.
- The `code` component replaces the `language-*` class on fenced code, so the language isn't in the rendered DOM. Nothing needs it today.
- `--string` joins the palette. Diff colours (`--add`, `--del`) are unchanged.
