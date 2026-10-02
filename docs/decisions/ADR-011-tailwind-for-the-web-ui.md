# ADR-011: Tailwind CSS v4 for the web UI

## Status
Accepted

## Date
2026-10-02

## Context
The Phase 0 UI (ADR-010) is styled with one hand-written stylesheet. The UI will grow (variant editor, rebase review, dashboard), and we want shared tokens and utility classes rather than one file of bespoke rules. The client is bundled by Bun's HTML bundler, both at runtime (`skillctx ui` from source) and at compile time (`bun build --compile`), not by Vite.

## Decision
Use Tailwind CSS v4 through `bun-plugin-tailwind`:

- `src/ui/client/styles.css` imports Tailwind with `source("./")`, so only the client folder is scanned.
- The palette and fonts stay plain custom properties (`--paper`, `--ink`, ...) switched by `prefers-color-scheme`. `@theme inline` exposes them as Tailwind names (`bg-paper`, `text-ink-soft`, `border-rule`, `font-mono`), so utilities follow dark mode without duplicated values.
- Existing hand-written rules live in `@layer components`, so a utility on the same element wins.
- `bunfig.toml` registers the plugin for the runtime bundler; `scripts/build.ts` passes it to `Bun.build` for the compiled binary, because the `bun build` CLI can't take plugins.

## Alternatives Considered

### Keep plain CSS
- Pros: no dependency, nothing to configure
- Cons: every new screen adds bespoke rules; no shared spacing or type scale
- Rejected: the UI is about to grow

### Tailwind via the PostCSS/Vite pipeline
- Pros: the most common setup
- Cons: we don't use Vite; adding it only for CSS means two bundlers
- Rejected: Bun's plugin covers both runtime and compile-time bundling

## Consequences
- Preflight resets browser defaults (margins, heading sizes, list styles). Bare elements need explicit styles.
- Class names that match a Tailwind utility (`grid`, `hidden`, `block`) get that utility generated and applied over the component rule. The presence table class was renamed from `grid` to `presence` for this reason.
- `bun-plugin-tailwind` bundles its own Tailwind compiler version, which can lag the `tailwindcss` package in `package.json`.
