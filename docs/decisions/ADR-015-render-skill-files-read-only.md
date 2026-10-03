# ADR-015: Show skill files in the UI, rendered read-only and kept local

## Status
Accepted. Extends ADR-010 (what the inventory UI shows). Syntax highlighting was added later by ADR-018.

## Date
2026-10-02

## Context
The inventory UI showed metadata about a skill (where it's installed, who installed it, whether it's outdated) but not what the skill says. To read a skill you had to find its folder on disk. Skills Manager's detail page renders SKILL.md, and that is the part of its UI people use most.

Skill files are third-party text. Rendering them in a page served from localhost means a skill could try to run script, load remote resources, or link outside its own folder. The UI also routes on the URL hash (`#/skill/<name>`), so ordinary `#anchor` links inside a skill would navigate away from the skill.

## Decision
- The skill page gets three tabs: **Contents** (the default), **Where it lives**, and **Compare copies** (only when the copies differ). The tab is in the hash: `#/skill/<name>/where`. Switching tabs replaces the URL instead of adding a history entry. Advice and frontmatter problems stay above the tabs.
- Contents shows one copy at a time, starting with the copy most locations use. You can switch copies and files. SKILL.md opens first, with its frontmatter collapsed above the body.
- Two read-only endpoints: `GET /api/skills/:name/files?copy=i` lists a copy's files using the same listing as the content hash, and `GET /api/skills/:name/file?copy=i&path=p` returns one file's text. A path is served only if that listing contains it, so `..` and absolute paths get a 404. Binary files and files over 256 KB return `text: null`, the same limit the copy diff uses.
- Markdown is rendered with unified (`remark-parse`, `remark-gfm`, `remark-rehype`) and `hast-util-to-jsx-runtime`, directly rather than through `react-markdown`. With the tree in hand, the heading outline and the rendered page come from one parse, and the following rules can be enforced:
  - Raw HTML is dropped (remark-rehype's default).
  - Images are never loaded. They show as "[Image not loaded: alt]", because fetching a remote image would send a request off the machine (local-first).
  - A link stays a link only if it is http(s) or mailto (opens in a new tab with `noreferrer`), a `#heading` on the page (scrolls there without touching the route), or a relative path to another file in the same skill (opens that file in the viewer). Anything else, including `javascript:` and paths outside the skill, renders as plain text.
- Headings get GitHub-style ids with a `md-` prefix, so a skill's own `#anchor` links work and can't collide with the app's ids. Wide screens show an "On this page" outline of the h2 and h3 headings. It doesn't use the name "Section", because the compiler hasn't decided where sections break.

## Alternatives Considered

### `react-markdown`
- Pros: one dependency; safe defaults
- Cons: doesn't expose the tree, so the outline would need a second parse that could disagree with the rendered ids
- Rejected: we already need the same unified packages, and using them directly costs about 40 lines

### `marked` plus a sanitizer
- Pros: small and fast
- Cons: produces an HTML string that must be sanitized and then injected with `dangerouslySetInnerHTML`
- Rejected: rendering to React elements leaves nothing to sanitize

### Serve skill images from the local folder
- Pros: diagrams in skills would show
- Cons: needs a raw-bytes endpoint and content-type handling; few skills have images
- Deferred: add it if skills with local images turn up

## Consequences
- Adds `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `hast-util-to-jsx-runtime` and `@types/hast`.
- Adds shadcn `tabs`, restyled to the underline style and our type scale (ADR-012).
- Adds a `title` text size (20px) and a `split` breakpoint (64rem) for the two-column contents layout.
- Code blocks aren't syntax-highlighted. Add that later if it's missed. (Superseded: ADR-018 adds highlighting.)
- Nothing is written; the inventory stays read-only (ADR-010).
