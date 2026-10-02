# ADR-013: Oxlint and Oxfmt instead of Biome

## Status
Accepted

## Date
2026-10-02

## Context
Biome linted and formatted the repo with its recommended preset. Biome's linter has its own partial type inference and covers only a few type-aware rules. The repo is on TypeScript 7, and Oxlint's type-aware backend (tsgolint v7, stable since September 2026) runs on typescript-go and covers nearly all of typescript-eslint's type-aware rules. Oxlint also ships the ESLint, typescript-eslint, unicorn, React and jsx-a11y rule sets under their usual names.

## Decision
Replace Biome with Oxlint (plus `oxlint-tsgolint`) for linting and Oxfmt for formatting.

- `.oxlintrc.json` enables the typescript, unicorn, oxc, import, react and jsx-a11y plugins, with the `correctness` and `suspicious` categories set to error. `bun run lint` runs with `--type-aware`.
- Rules turned off, and why:
  - `react/react-in-jsx-scope`: the automatic JSX runtime doesn't need it.
  - `typescript/no-unsafe-type-assertion`: it flags every `as Error` and `JSON.parse(...) as T`. That's 41 sites, and they need runtime validation rather than a lint fix.
  - `typescript/consistent-return`: it flags exhaustive `switch` statements, which tsc already checks.
  - `typescript/no-unnecessary-type-parameters`: it flags the typed `readJson<T>` helpers.
  - `unicorn/no-array-sort` and `unicorn/consistent-function-scoping`: style preferences.
  - `jsx-a11y/prefer-tag-over-role`: it pushes `<output>` for every `role="status"`, and a `<fieldset>` for shadcn's `role="group"`.
  - `jsx-a11y/control-has-associated-label`: it can't see labels rendered through child components.
- `.oxfmtrc.json` sets only what differs from Oxfmt's defaults: tabs, an 80-column width (Biome's; Oxfmt defaults to 100), and `sortImports` with `newlinesBetween: false`, which matches Biome's organize-imports output. Markdown and YAML are ignored, as they were under Biome, so the docs and the spec synced with the Claude Doc are not reflowed.
- One-off exceptions use `// oxlint-disable-next-line <rule> -- <reason>`, the same way `biome-ignore` comments were used.

## Alternatives Considered

### Keep Biome
- Pros: one tool and one config; a stable formatter; the setup already worked
- Cons: few type-aware rules; Biome rule names don't match the wider ESLint ecosystem
- Rejected: we want typescript-eslint's type-aware checks (floating promises, misused promises) before the compile engine adds async-heavy code

### Biome for formatting, Oxlint for linting
- Pros: Biome's stable formatter, plus Oxlint's rules
- Cons: two toolchains, and the import-sorting and lint rules overlap
- Rejected: Oxfmt already matches Biome's output on this repo with no source changes

## Consequences
- Oxfmt is still 0.x. Upgrades may change formatting, so run `bun run format` after bumping it and review the diff.
- `oxlint-tsgolint` follows TypeScript releases. Keep it on the same TypeScript major version as `typescript` in `package.json`.
- Editors need the Oxc extension (it provides both the Oxlint and Oxfmt language servers) in place of the Biome extension.
- ADR-012 mentions `biome-ignore` comments in `input-group.tsx`. Those are now `oxlint-disable-next-line` comments, and the `role="group"` exception is no longer needed because `prefer-tag-over-role` is off.
- `package.json` keys are sorted by Oxfmt's `sortPackageJson` (on by default).
