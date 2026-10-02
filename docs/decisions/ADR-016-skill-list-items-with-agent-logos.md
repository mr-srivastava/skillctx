# ADR-016: Skill list as items with agent logos

## Status
Accepted. Supersedes two conventions in ADR-012: "icons come from `lucide-react` only" and "the presence squares stay custom" (for the skill list).

## Date
2026-10-02

## Context
The skill list was a table: a Skill column, one column per location (Agents, Claude, Codex, ...) holding a presence square, and a State column. With seven or more locations most cells were empty dots, the table was wide, and the squares had to be learned from a legend. Comparable tools (Skills Manager's list) show one row per skill with the logos of the agents it is installed for, which reads faster and looks finished.

Lucide has no brand logos, so following that layout needs a second icon source.

## Decision
- The skill list renders shadcn `Item` rows in an `ItemGroup`: name and description on the left, the locations as logos, then the states. The name link stretches over the row, so the row is the click target.
- Only locations that hold the skill are shown. Past five, the rest fold into "+N", whose hint names them.
- Agent logos come from Lobe Icons (MIT), inlined as React components in `src/ui/client/components/logos.tsx`: Claude, Codex, Cursor, Gemini, OpenCode. Mono logos draw in `currentColor`; colour logos keep their brand colours. Locations no single agent owns use Lucide: `~/.agents` (Bot), Skills Manager (Library), plugins (Plug), folders from `skillctx.yaml` (Folder). The mapping is `ROOT_ICON` in `components/presence.tsx`.
- A copy that differs from the main one gets a small dot in the differs colour on its logo (or on "+N" when that location is folded). Real folder versus symlink is in the logo's hint and `sr-only` text, not drawn.
- Filtering by location moves from the column headers to a "In any location" `Select`, with the same logos.
- A toggle switches the list to a grid of cards with the same content (name, description, logos, states). The card's name link also stretches over the card. The choice lasts for the session only.

## Alternatives Considered

### Keep the table
- Pros: locations line up in columns; symlink versus folder is visible at a glance
- Cons: wide, mostly empty, needs a legend
- Rejected: which agents have a skill matters more than which kind of copy each holds; the skill page still has the per-copy table

### Add a logo package (`@lobehub/icons`, `simple-icons`)
- Pros: no vendored SVG data; easy to add more agents
- Cons: thousands of icons bundled or imported for five; `simple-icons` lacks OpenAI/Codex and Gemini's mark
- Rejected: five inlined SVGs are smaller and work offline

### Logos with a text label each
- Pros: names visible on touch, where hints don't open
- Cons: back to a wide row
- Rejected: the logos are recognisable; names stay in hints and `sr-only` text

## Consequences
- A new agent root needs an entry in `ROOT_ICON`; without one it falls back to the Folder icon. Fetch the logo from Lobe Icons' `@lobehub/icons-static-svg` and add it to `logos.tsx`.
- Phone users see logos without names (Radix hints don't open on touch). The location filter lists names, and the skill page names every location.
- Symlink versus real folder is no longer visible in the list. The skill page's copies table keeps the presence squares (`Cell` in `ui.tsx`).
- Brand logos are the owners' trademarks, used to name the agent a folder belongs to.
