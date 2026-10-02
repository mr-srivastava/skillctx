# ADR-012: shadcn/ui for UI components

## Status
Accepted

## Date
2026-10-02

## Context
The UI (ADR-010) will need more than buttons and tables: dialogs, menus, tabs and popovers for the variant editor and rebase review. Building those accessibly by hand is slow. Tailwind is already in place (ADR-011).

## Decision
Use shadcn/ui. Components are copied into `src/ui/client/components/ui/` with `bunx shadcn@latest add <name>` and owned by this repo, so we edit them to fit the design.

- `components.json` uses the `@/` alias for `src/ui/client/` (set in `tsconfig.json` `paths`; Bun resolves it at runtime and in the compiled binary).
- shadcn's token names (`--color-primary`, `--color-border`, ...) are mapped in `styles.css` onto the existing palette, so added components match without restyling and follow dark mode.
- Class merging uses `cn` from `@/lib/utils`, built with `createCn` from shadcn's `cn` package and extended with our role-named text sizes.

## Alternatives Considered

### Keep hand-rolled components
- Pros: no dependencies
- Cons: accessible dialogs, menus and focus management are a lot of work to get right
- Rejected: the next UI phases need them

### A packaged component library (Radix Themes, Mantine)
- Pros: install and use
- Cons: styles live in the package; matching our design means fighting it
- Rejected: shadcn gives the same Radix primitives with source we control

## Consequences
- The CLI may write `import { cn } from "cn"` (it did for the first component, before `@/lib/utils` existed; later adds used `@/lib/utils`). That `cn` doesn't know `text-caption` and friends and drops them next to a text colour. A test in `test/ui.test.ts` fails if any client file imports it.
- Radix `Select` can't use `""` as an item value. Filters that mean "no filter" use a sentinel (`ANY`) and map it back to `""`.
- Generated components use Tailwind's default sizes (`text-sm`, `h-9`). Adjust variants to the type scale when adding one, as was done for `Button`, `Input` and `Select` (`text-body`, `bg-card`, the page-wide focus outline instead of shadcn's ring, an `inline` size for link-style buttons).
- Adding a component that depends on one we've tuned (`input-group` needs `button` and `input`) prompts to overwrite it, and `--yes` doesn't answer that prompt. Run `yes n | bunx shadcn@latest add <name>` to keep our versions.
- Radix tooltips don't open on touch. `Hint` (in `ui.tsx`) is for extra detail on hover and keyboard focus; anything a phone user needs stays visible or in `sr-only` text.
- shadcn's `InputGroup` uses `role="group"` on divs and a mouse-only click-to-focus; Biome flags both, and the file carries `biome-ignore` comments with the reasons.
- Adds `radix-ui`, `class-variance-authority`, `lucide-react`, `cn` and `tw-animate-css`.
