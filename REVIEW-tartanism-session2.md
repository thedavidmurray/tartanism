# Tartanism Session 2 Review

Review method: I attempted `npm run dev`, but the sandbox blocked Vite from binding a localhost port (`listen EPERM`), so I could not do a full live browser pass in this environment. Findings below are based on:

- Static route rendering of the new pages
- Source inspection of the router and `/studio` integration
- `npm run build` output

`npm run build` completed cleanly with no warnings. Notable output:

- `dist/assets/index-B35tasVT.js`: 356.83 kB, 104.83 kB gzip
- `dist/assets/OldApp--SUzP9Zi.js`: 177.52 kB, 44.98 kB gzip
- `dist/assets/LibraryPage-CE7LOn51.js`: 5.26 kB, 2.07 kB gzip
- `dist/assets/PatternDetail-C-ymykHx.js`: 4.86 kB, 1.78 kB gzip
- `dist/assets/PatternModal-CFLDRLen.js`: 4.96 kB, 1.95 kB gzip

## Failures

- `/pattern/royal-stewart` is broken. The route lookup uses `decodeURIComponent(id)` and exact display-name matching, while library cards link to `/pattern/${encodeURIComponent(tartan.name)}`. The result is that `/pattern/royal-stewart` renders `Pattern not found`, and the internally valid URL is `/pattern/Royal%20Stewart`. This is confirmed by the render harness and the route code in `src/pages/LibraryPage.tsx:139-141`, `src/pages/PatternDetail.tsx:146-177`, and `src/pages/PatternModal.tsx:108-138`.

- `/studio` will lose session state when the user leaves the route and comes back. `AppShell` unmounts `OldApp` whenever the route changes (`src/AppShell.tsx:98-104`), but `OldApp` still keeps generator config, generated tartans, modal state, and most working state in local component state (`src/OldApp.tsx:5914-5957`). Only custom colors are persisted to localStorage. That is a deterministic regression from the pre-routing app.

- There is no catch-all route. Unknown URLs outside `/pattern/:id` will fall through `Routes` and render a nav shell with no page body (`src/AppShell.tsx:98-113`).

## Confusion

- The app is hard-coded to `/tartanism` in two places: `BrowserRouter basename="/tartanism"` (`src/AppShell.tsx:125`) and Vite `base: '/tartanism/'` (`vite.config.ts:6`). That means the checklist URLs `/`, `/library`, `/studio`, and `/pattern/royal-stewart` are not the actual local/deployed URLs. The expected deployed paths are `/tartanism/`, `/tartanism/library`, `/tartanism/studio`, and currently `/tartanism/pattern/Royal%20Stewart`.

- Clicking a library card opens a modal overlay, but the card UI does not signal “quick view” versus “full page”. The only affordance is the click itself. Users will not know the first interaction is modal-driven until after it happens.

- The Library page has a fixed top nav from `AppShell` and its own sticky header, but the page itself does not offset for the fixed nav (`src/AppShell.tsx:22-25`, `src/pages/LibraryPage.tsx:235-279`). This likely creates a stacked-header feel at best, and overlap at worst.

## Feedback

- Accessibility needs work. The modal has no `role="dialog"`, no `aria-modal`, no focus trap, and no focus restoration path (`src/pages/PatternModal.tsx:140-257`). The library search uses placeholder text instead of a real label (`src/pages/LibraryPage.tsx:261-270`). Color dots and palette swatches are purely visual.

- Code duplication is high across the new routes. The canvas renderer is duplicated in Library, Detail, and Modal; palette derivation is duplicated in Detail and Modal (`src/pages/LibraryPage.tsx:13-57`, `src/pages/PatternDetail.tsx:12-61`, `src/pages/PatternModal.tsx:12-61`, `src/pages/PatternDetail.tsx:74-134`, `src/pages/PatternModal.tsx:73-96`). Session 3 should extract a shared tartan preview/rendering layer.

- The new Zustand store is currently dead code. `useTartanStore` is defined but not consumed anywhere in `src/`, while `/studio` still uses its own local state and its defaults do not match the store defaults (`src/store/tartanStore.ts:50-103`, `src/OldApp.tsx:5916-5933`). That makes the architecture look mid-migration rather than complete.

- There is a type-quality bug in `AppShell`: the background-location state is cast to DOM `Location`, not the router `Location` type (`src/AppShell.tsx:81`). It compiles because `Location` exists globally, but it is the wrong type and weakens route-state safety.

- Mobile density is probably too high on the Library page. The layout stays `grid-cols-2` at every breakpoint and relies on `text-xs` and `text-[10px]` metadata (`src/pages/LibraryPage.tsx:165-175`, `src/pages/LibraryPage.tsx:279-282`, `src/pages/PatternDetail.tsx:123-127`, `src/pages/PatternModal.tsx:214-215`). At 390x844, that is likely usable but tight.

- Lazy loading helps, but the base app shell is still large: the main bundle is 356.83 kB before gzip. The route-level chunks are small, but the initial experience is not yet especially lean.

## Opportunities

- Add a stable `slug` field to tartan records and route off that. Support redirect/lookup from old encoded-name URLs so both shared links and human-typed links work.

- Move `/studio` working state into the Zustand store or another persistent layer before more routing is added. State loss on route change is the biggest regression risk in the overhaul.

- Add a wildcard 404 route and a proper not-found page for all unmatched URLs, not just missing pattern IDs.

- Extract shared tartan rendering, palette derivation, and preview-card behavior into reusable utilities/components. That will reduce drift between Library, Detail, and Modal.

- Resolve the header stack by giving routed pages a consistent top offset, or by making the local sticky header use `top-12` under the global nav.

- Improve the Library information architecture:
  - use 2 columns on phones, 3 on tablets, 4 on desktop
  - add a visible “Quick View” or “Open” affordance on cards
  - consider a sort control since the grid is large enough to browse in multiple modes

- Add interaction tests for:
  - `/pattern/:id` slug lookup
  - modal open/close and back-button behavior
  - `/studio` state persistence across route changes
  - unmatched route handling

## Screenshots/Evidence

- `/`: centered hero with `Tartanism`, short product tagline, primary `Browse Library` CTA, secondary `Design Studio` CTA, and a small “Scottish Register conventions -- Built for plaid” footer note.

- `/library`: fixed shell nav at the top, then a local sticky header with breadcrumb-style `Tartanism / Library`, a `123 tartans` count, a search field, and 7 category chips (`All Tartans` plus 6 categories). The grid renders 123 card links. The first cards are `Royal Stewart`, `Black Watch`, `MacLeod of Lewis`, `Campbell of Argyll`, and `MacDonald`.

- `/pattern/royal-stewart`: currently renders a not-found state with `Pattern not found` and a `Back to Library` link.

- `/pattern/Royal%20Stewart`: renders the expected detail page with breadcrumb `Library / Royal Stewart`, a large square preview mat, `Royal` category pill, description text, six color swatches with hex labels, a threadcount block, and `Back to Library` / `Open in Studio` actions.

- Modal overlay for `Royal Stewart`: dark blurred backdrop, charcoal panel, parchment preview mat, top-right close button, compact palette swatches, threadcount block, and `Close`, `Full Page`, and `Studio` actions.

- `/pattern/nonexistent-id`: renders the same not-found screen as the broken slug route, which is correct for a truly missing record.

- `/studio`: source still points to the old Pattern Studio shell, including the gradient header, `Generator` / `Builder` / `Library` nav, `Roll 6` action, settings toggle, empty-state “Ready to design tartans?” prompt, and the existing footer. I could not live-drive this route because the sandbox would not allow the dev server to start, so this route is source-verified rather than browser-verified.
