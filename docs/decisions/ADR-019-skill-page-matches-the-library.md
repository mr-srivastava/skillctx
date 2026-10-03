# ADR-019: Skill page uses the Library's layout and logos

## Status
Accepted. Supersedes ADR-016's "the skill page's copies table keeps the presence squares". The rest of ADR-016 stands.

## Date
2026-10-03

## Context
ADR-016 turned the Library from a table of presence squares into item rows with agent logos, status pills and a bordered toolbar. The skill page was left as it was, so the two pages now look like different apps:
- The skill page header was a name and a paragraph. It showed neither the status pills nor the logos the Library uses for the same skill.
- "Where it lives" was still the squares table: one column per location, most cells empty dots, with a legend the Library no longer teaches. "Installed by" was a separate list that pointed back at copies by number.
- The copy, file and compare pickers sat loose on the page, while the Library's filters sit in a toolbar.

## Decision
- **Header.** The skill card's parts, laid out as a page header: a "Library" back link, the name with the same status pills as a card, the description, then a summary strip that lists the locations as logos, the number of copies (and versions, with the differs dot when they differ), and which installers recorded it.
- **Where it lives.** One `Item` row per copy, as in the Library list: the folder path, a description line (`Copy 2 · 2 files · 19.1 KB · different content · edited after install`), the installers that recorded that copy and what they recorded, and on the right the logos of the locations that read it. A copy whose content differs from the main copy gets the differs dot on its logos, as in the Library. Folder versus symlink is in each logo's hint and `sr-only` text, as ADR-016 does for the list. The separate "Installed by" list is gone; each copy carries its own.
- **Toolbars.** The Contents and Compare pickers sit in the same bordered strip as the Library's filters (`TOOLBAR` in `components/display.tsx`, shared by all three).
- **Shared pieces.** `SkillStatuses` moves to `components/status.tsx` so cards and the skill page draw the same pills. `mainCopy` and `copyPresence` in `lib/model.ts` give each copy's presence per location, and the Library's per-skill presence is built from them.

## Alternatives Considered

### Keep the squares table and restyle it
- Pros: folder versus symlink is visible without hovering; locations line up in columns
- Cons: the same width and empty-cell problems ADR-016 removed from the Library, and a second visual language for one fact
- Rejected: the logos and hints carry the same information, and the Library already relies on them

### Logo columns (a table with logos as headers)
- Pros: keeps the columns
- Cons: still mostly empty cells, and a third presentation of locations
- Rejected: rows read like the Library and stay narrow on phones

## Consequences
- `Cell`, `CELL`, `H2`, `DESC` and the presence-square styles are removed. Nothing draws presence squares any more.
- Folder versus symlink is only in hints and screen-reader text, everywhere. Hints don't open on touch (ADR-012), so on a phone you can't see whether a location holds a symlink. Add a visible mark if that turns out to matter.
- A skill with many copies is now a longer list instead of a wider table.
