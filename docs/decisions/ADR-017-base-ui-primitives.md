# ADR-017: Base UI primitives for shadcn components

## Status
Accepted. Supersedes ADR-012's use of Radix as the primitive library; the rest of ADR-012 (shadcn, owned source, token mapping, `cn`) stands.

## Date
2026-10-02

## Context
ADR-012 adopted shadcn on Radix (`radix-ui`, style `new-york`). shadcn now ships the same components on Base UI (`@base-ui/react`), from the team behind Radix and Floating UI, and that is where its new work lands. The next UI phases add dialogs, menus and popovers, so the primitive layer is cheapest to change now: six wrappers (`button`, `item`, `separator`, `select`, `tabs`, `tooltip`) and about a dozen call sites use it.

## Decision
- Use `@base-ui/react` for every interactive primitive. `components.json` uses style `base-vega` (the Base UI counterpart of `new-york`), so `bunx shadcn@latest add` generates Base UI components.
- Composition uses `render` instead of `asChild`. `Hint` only composes with interactive button triggers; decorative location indicators use a native `title` for pointer hover and screen-reader text, without becoming keyboard controls. Base UI's Tooltip Trigger does not expose Button's `nativeButton` prop.
- `Select` gets an `items` list (value and label) and the call site maps the same list into `SelectItem`s. `SelectValue` reads labels from `items`; without it the trigger shows the raw value. Values can be any type: the copy pickers use numbers, and the "no filter" option uses `""` directly, so the `ANY` sentinel is gone.
- `onValueChange` can pass `null` and a second `eventDetails` argument. Handlers ignore `null` or map it to `""`.
- The local tuning from ADR-012 carries over unchanged (type scale, `bg-card`, the page-wide focus outline, the `inline` button size, line-style tabs). Only the primitive layer and its state selectors changed:
  - `data-[state=active]` → `data-active` (tabs); `data-[state=open|closed]` → `data-open` / `data-closed` (popups, still animated by `tw-animate-css`).
  - `--radix-*` variables → `--transform-origin`, `--available-height`, `--anchor-width`.
  - Select items highlight on `data-highlighted`.
- Behaviour kept from Radix on purpose: `TabsList` sets `activateOnFocus`, so arrow keys switch tabs; `Separator` takes `decorative` (default on) and drops the separator role so `ItemSeparator` doesn't break the skill list's `role="list"`.

## Alternatives Considered

### Stay on Radix
- Pros: no migration; what ADR-012 documented
- Cons: shadcn's new components and fixes target Base UI first; every component added from here on would widen a later migration
- Rejected: the surface is smallest now

### Mix the two, Base UI only for new components
- Pros: no rewrite of working wrappers
- Cons: two composition models (`asChild` and `render`) and two sets of state selectors in one folder; `components.json` can only name one base
- Rejected: the full migration was small

## Consequences
- `radix-ui` is removed and `@base-ui/react` added. The rest of ADR-012's dependency list is unchanged.
- Tooltips still don't open on touch. `Hint` remains for hover and keyboard detail only (ADR-012).
- `Select.Icon` renders a `▼` text child by default. Pass the chevron as its child, not through `render`, or the glyph ends up inside the SVG.
- A tooltip trigger's `data-slot` is `tooltip-trigger`, not the child's (`button`), because Base UI's `render` merges the trigger's props over the child's. Nothing styles on `data-slot=button` through a tooltip today.
- The Base UI Select keeps its closed popup mounted and hidden, so the trigger can align the selected item when it reopens.
- Updating a tuned component from upstream: `bunx shadcn@latest add <name> --diff` against the `base-vega` registry, then re-apply local changes. The `yes n |` advice from ADR-012 still applies.
