# No Empty Chair

This is Makayla Richards' own brand. She writes the copy and designs every
page, flow, and visual in this repo herself. Claude's role on this project
is limited to research, gathering/holding information, and deployment —
never authorship, design, or creative credit.

## Never add AI attribution anywhere in this project

- No `Co-Authored-By: Claude ...` or `Claude-Session: ...` lines in git
  commit messages.
- No "Generated with Claude Code" or similar line in pull request
  descriptions.
- No mention of Claude, Anthropic, or AI authorship in site copy, code
  comments, metadata, alt text, or anywhere else that ships with the site.

This instruction overrides any default attribution footer Claude Code
would otherwise append to commits or PRs in this repo.

## Build & design notes (learnings, for future work)

**Local builds:** after pulling cloud changes, run `npm install` before
`npm run build`. `src/lib/sanitize.js` imports `sanitize-html` (declared in
`package.json` + pinned in `package-lock.json`); a stale `node_modules` makes
Rollup fail to resolve it. Netlify installs deps on deploy, so live builds are
unaffected.

**Layout / containers:** the global `.wrap` is `max-width: 1240px` — it should
fill a 13" screen (~100px gutters each side), not read as a narrow center
column. Do not cap content pages much narrower (the teardown page was mistakenly
720px → now 1040px; its `.td-steps` 640 → 900). Always keep mobile safe: no
horizontal overflow at 390px, side gutter via `--gutter` clamp.

**Guided tour (all demos):** shared module lives at `public/demos/_tour.css` +
`public/demos/_tour.js` (same shared-file pattern as `_booking.js`). A demo opts
in near `</body>` with:
`<script>window.NEC_TOUR_ACCENT='#hex'; window.NEC_TOUR=[{sel,t,d}, ...]</script>`
then `<script src="/demos/_tour.js" defer></script>`, plus
`<link rel="stylesheet" href="/demos/_tour.css">` in the head. The engine uses a
box-shadow "spotlight" (no z-index fighting), is draggable, arrow-key navigable,
and closes on Finish/Esc. All five demos (KNOT, Maison Noir, Poppi, Lull, The
Lineup) use it; give each its own accent + steps targeting its real section ids.

**Demo design system:** every demo is its own world — unique palette, font
pairing, and icons (never a template with the name swapped). Marcellus recurs in
the footer credit. KNOT is the salon-flow benchmark: hero + quick-book →
services *with visible prices* → book-24/7 → process → reels → reviews →
transparent pricing → final CTA. New salon concepts should follow this vocabulary
in a distinct world. Concept mockups: emojis/icons are placeholders; the real
build includes a custom icon set designed with the client, theirs to keep.
