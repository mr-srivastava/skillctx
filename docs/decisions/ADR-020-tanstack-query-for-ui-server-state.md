# ADR-020: TanStack Query for the UI's server state

## Status
Accepted.

## Date
2026-10-03

## Context
The web UI loaded everything with hand-written `useEffect` fetches: the inventory in `App.tsx`, a copy's file list and one file in `Contents.tsx`, and the copy diff in `DiffView.tsx`. Each repeated the same parts: loading and error state, a `live` flag so a slow response for an old selection can't overwrite a new one, and lint suppressions for setting state in an effect. `DiffView` was missing the `live` guard, so switching copies quickly could show the wrong diff (fixed in 4cb7365). Nothing was cached, so going back to a skill refetched its files. After a rescan, `App` reloaded the inventory, but an open file or diff kept showing what it had loaded before.

The compile engine will add more routes and more views of the same data, so this pattern would keep multiplying.

## Decision
- Use `@tanstack/react-query` v5. `main.tsx` wraps the app in a `QueryClientProvider`.
- `lib/queries.ts` holds one `queryOptions` per request in `lib/api.ts`, plus the client defaults. `api.ts` stays the only place that knows URLs.
  - Keys: `["inventory"]`, and `["skill", name, "files" | "file" | "diff", ...]`, so a skill's data shares a prefix.
  - Defaults: data never goes stale on its own (`staleTime: Infinity`); no retries, because the server is on this machine and the page reports errors; no refetch on window focus.
  - `networkMode: "always"` for queries and mutations. The server is `127.0.0.1`, so the browser's online state says nothing about it; the default (`"online"`) pauses every query on a machine with no network, which would leave the page loading forever (local-first).
  - Query functions pass TanStack's `AbortSignal` to `fetch`, so a request for a file or diff you've switched away from is cancelled.
  - Exception: the inventory goes stale immediately and refetches on window focus, so a scan run from a terminal (`skillctx inventory`) shows up when you return to the page.
  - A file query with no file picked yet, and a diff of a copy with itself, use `skipToken` and fetch nothing.
- Rescan and "Check for updates" are a mutation (`refreshMutation`, key `["refresh"]`, used through `useRefresh`). Its `onSuccess` invalidates every query, not just the inventory, because a rescan can change any skill's files, and returns that promise so the mutation stays pending until the page has the new data. A refused refresh invalidates nothing. The busy state comes from the mutation's pending state and its `check` argument. The status message stays as local state in `App`.
- The Library's rows are derived from the inventory with a `select` defined once at module level, so they're recomputed only when the inventory changes.
- Components read `data` and `error` from `useQuery`. Because every query is keyed by its selection, a late response for an earlier selection can't show, and the hand-written guards go away.

## Alternatives Considered

### Keep the hand-written effects
- Pros: no dependency; four fetches are manageable
- Cons: the guard and loading/error code repeats in every view, one view already got it wrong, no caching, and a refresh doesn't reach open files
- Rejected: the next phase adds views, and the cost grows with each

### React 19 `use()` with Suspense
- Pros: built in
- Cons: we'd still need to write caching, invalidation and keyed promises, which is most of what a query library is
- Rejected: we'd be reimplementing TanStack Query badly

### SWR
- Pros: smaller
- Cons: weaker mutation and invalidation story (a refresh that invalidates everything is the main need here), and less control over per-query freshness
- Rejected: TanStack Query fits the refresh-then-invalidate model directly

## Consequences
- Adds `@tanstack/react-query` (about 11 KB gzipped for what the UI imports). No devtools package: the UI is compiled into the binary, and the cache holds five kinds of data, small enough to inspect without one.
- A new route gets a function in `api.ts`, a `queryOptions` in `queries.ts`, and `useQuery` in the view. A route that changes data gets a mutation that invalidates what it touches.
- Revisiting a skill or file during a session is served from the cache. A refresh, or a window focus for the inventory, is what brings new data.
- `test/queries.test.ts` covers refresh invalidation, loading with no network, abort signals, and the `skipToken` cases.
