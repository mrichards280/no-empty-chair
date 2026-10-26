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

**Guided-tour features (shared engine):** the tour card can be dragged (by the
top bar or grip), **minimized to a bubble** (this is the pause — collapse it, use
the page, resume at the same step), and both the card and the bubble link to the
No Empty Chair homepage. Arrow keys navigate; Esc minimizes. The engine lives in
`public/demos/_tour.css` + `_tour.js`; standalone concept previews (Hair Loft,
Cakewalk) inline those same shared files at build time so there is one source of
truth. Give each page its own accent via `window.NEC_TOUR_ACCENT`.

**On-page copy vs the tour:** the visible page always speaks **brand → customer**
(client-facing). The "here's what this does for your business / how it helps you"
explanation belongs in the **tour steps**, never in the page copy. The only
NEC-facing element on a page is the demo band / concept banner at the very top.

**Booking UX matches the business:** a salon books by **appointment** — a modal
that pops open over the page (never an inline section you scroll to): service
(with photos) → stylist → date → time → confirm + deposit. A barber "orders like
a menu" (build-a-check). Don't reuse the barber check flow for a salon.

**Concept banner:** concept previews carry the NEC chair-mark logo in the top
concept/demo band (not just text).

**Concept vs public demo:** a prospect concept preview stays watermarked +
disclaimed and password-gated (optionally hosted gated, e.g. Hair Loft). A public
gallery demo (KNOT, Cakewalk) is open, un-gated, and listed in `content.json`
`demos.items`. Cakewalk was made by genericizing the Sweet Pea concept (fictional
brand, licensed stock photos, gate removed) — see `build_bakery_demo.py`.

**Admin security:** `/admin` is behind a Netlify **edge function** Basic-Auth
wall (`netlify/edge-functions/admin-gate.js`, checks `ADMIN_PASSWORD`, fails
closed). The Arrange tool (`_tinker.js`) is **admin-only** (requires the
`nec-admin-edit` localStorage flag set after admin sign-in) and is client-only —
it never writes to the server. Real content saves go through
`netlify/functions/save-content.cjs`, which validates `ADMIN_PASSWORD` and uses a
`GITHUB_TOKEN` — both **env vars, never in this public repo**. Never hardcode
those secrets.

**CMS reality:** today's `/admin` is a content-field editor (edits
`content.json` → commits to GitHub → redeploys) plus a client-only Arrange
helper. A true visual page-builder (drag blocks on a grid, resize, mixed content
types) is a separate project — the right fit is a git-based block editor like
**Puck** or **TinaCMS**, not extending the Arrange tool.

## UI/UX rules (apply to every build)

**Interactive elements are real elements.** Anything clickable is a `<button>`
or `<a>`, never a styled `<div>`/`<span>` — every time that got skipped (the
barber.html menu items, Poppi's tiles, the toggle switches) it broke on text
wrap or failed keyboard/screen-reader use and had to be retrofitted. Every
interactive element gets a visible `:focus-visible` state.

**Overlays trap focus properly.** Any modal/sheet (booking sheet, checkout,
radar popup): focus the first element on open, Tab wraps inside it, Esc
closes it, focus returns to the trigger on close.

**Layout fills the real viewport.** `.wrap` is 1240px max-width so it reads
full on a laptop, not a narrow center column (the teardown page's mistaken
720px cap was the one exception, and it read cramped). Mobile-safe always: no
horizontal overflow at 390px, gutters via `clamp()`, test every surface at
phone width before calling it done. Fixed-height containers are a trap for
variable-length text — let content drive height.

**The flow matches the real business process, not a generic template.** A
salon books by appointment (modal: service → stylist → date → time →
confirm); a barber orders like a menu (build-a-check) — don't reuse one
business's flow for a different kind of business. Break a long ask into
stages instead of one giant form (the Teardown's quick-intake-now /
deep-questionnaire-after-payment split). Don't make people retype what's
already known (URL-param prefill on handoff links). Design for who's
actually at the keyboard, not just an idealized single user (the "who's
filling this out" field — these forms get filled out live with clients as
often as solo).

**CSS discipline.** Scope class names in shared stylesheets — a generic
`.logo` meant for the nav silently broke an unrelated `.logo` in the admin
panel; that's what global CSS + generic names does. Respect
`prefers-reduced-motion` wherever something auto-animates.

**Shared engine, unique skin.** The guided tour and booking sheet
(`_tour.js`/`_booking.js`) are one system every demo inlines, but palette,
fonts and icons are different per demo — never a reskinned template (see
Demo design system, above). Client-facing copy stays brand → customer; "why
this matters for your business" belongs in the tour/admin layer, never the
visible page (see On-page copy vs the tour, above).

**Verify for real.** Test against a production build (`npm run build` +
`npm run preview`), not dev mode — the dev toolbar alone produced several
false-positive "bugs" earlier in this project. Accessibility (labels, ARIA,
live regions) is cheaper built in than retrofitted — this project did a full
audit pass fixing it after the fact, which cost more than doing it inline
would have.
