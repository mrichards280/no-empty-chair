# No Empty Chair — Concept & Component Catalog

A running inventory of every demo site and prospect concept we've built, with **named layout
archetypes** and **named components ("bits and bobs")** so we can track what we like, remix
the good parts into new sites, and improve them over time.

Rule of thumb (see also `distinct-layouts-and-alternates` memory): reuse the shared **modules**
(tour, gate, watermark, booking), but give every new concept its own **layout archetype** —
never reskin one skeleton. Save alternates as `-a` / `-b` in the lead's folder.

Last updated: 2026-09-23.

---

## Layout archetypes (name → where it lives → what it's good for)

| # | Archetype | Signature moves | Used by | Best for |
|---|-----------|-----------------|---------|----------|
| L1 | **Bento Salon** | Bento-grid hero, priced service cards, marquee, numbered process, reels, reviews, dark CTA, mobile app-bar | **KNOT** (benchmark) | The default salon that has to look modern + trustworthy |
| L2 | **Editorial Atelier** | Split hero over anchored cover, accolades band, service *list rows*, mosaic gallery, founder story, reserve card | **Maison Noir** | Quiet-luxury, by-appointment, story-forward brands |
| L3 | **Pop Bento** | Split hero with floating chips, neo-brutalist hard-shadow cards, masonry gallery, loud color | **POPPI** | Loud, playful, high-energy studios (nails/color) |
| L4 | **Calm Column** | Ken-Burns cover hero, philosophy statement, grouped priced menu, **membership tier band** | **Lull** | Spas / wellness / membership businesses |
| L5 | **Receipt / Build-a-Check** | Two-column menu + sticky animated **receipt rail** that rings up a running total; bespoke checkout | **The Lineup** (barber) | "Order like a menu" businesses (barbers, à-la-carte) |
| L6 | **Order + Back-Office** | Menu order flow, inquiry form, and a **back-office hub** (inbox → accept → agenda) | **Cakewalk** / **Sweet Pea** | Custom-order businesses (bakeries, event work) |
| L7 | **Full-Bleed Concept** | Centered full-bleed hero → service grid → gallery → reels → reviews → (FAQ) → book | **Hair Loft**, **Sani**, **SBK-A** | Fast prospect concepts — but overused; diversify away from it |
| L8 | **Editorial Lookbook / Left-Rail** | Fixed left **sidebar nav**, split hero, **zig-zag numbered service rows**, **tier comparison band**, mosaic, reel strip | **SBK-B** (live) | High-end, menu-deep studios that want a fashion-house feel |

**Structurally distinct one-offs worth protecting:** L5 receipt flow (Lineup), L6 back-office hub
(Cakewalk/Sweet Pea), L8 left-rail (SBK-B), L4 membership band (Lull). L7 is the shell we're
deliberately moving away from.

---

## Component library — the "bits and bobs"

Reusable pieces, where they were built best, and where to spread them next.

### Shared modules (single source, in `/public/demos/`)
- **Guided Tour Engine** — `_tour.js` + `_tour.css`. Spotlight highlight, draggable, minimize-to-bubble (= pause), arrow-key nav, card+bubble link home. Opt in with `window.NEC_TOUR=[…]` + `NEC_TOUR_ACCENT`. *In all 10 builds.*
- **Appointment Booking Modal** — `_booking.js` + `_booking.css`. Phased flow, multi-service cart, add-ons, PENDING request, tentative .ics calendar holds. *Public salons (KNOT, Maison, Poppi, Lull).* Concept previews inline a lighter modal variant.
- **Arrange / Tinker** — `_tinker.js`. Admin-only (`?edit`) drag-to-rearrange, localStorage, client-only.

### Guardrail components (every concept)
- **Password Gate** — `html.gate-locked` + full-screen `#gate` card; `value.trim().toUpperCase()===PW`. Passwords: Hair Loft `HEALTHYHAIR`, Sani `LAIDEDGES`, SBK `STITCHEDUP`, Sweet Pea `MORECAKE`.
- **Concept Watermark Bar** — top NEC chair-mark band; **must link to noemptychair.co** (see `nec-bar-links-home` memory). Plus the footer disclaimer + diagonal overlay.
- **Icon-notebook footer note** — emojis/icons are placeholders; custom icon set designed with client, theirs to keep.

### Layout / hero pieces
- **Bento Hero Grid** (KNOT) · **Split/Asymmetric Hero** (Maison, Poppi, SBK-B) · **Ken-Burns Cover Hero + Philosophy line** (Lull) · **Photo + Rotated Wax Stamp** (Lineup) · **Left Fixed Sidebar Nav** (SBK-B).

### Content blocks
- **Priced Service Card Grid** (KNOT, Poppi, Hair Loft, Sani, SBK-A) — cards with visible prices + book buttons.
- **Priced Service List Rows** (Maison, Lull) — quieter, editorial.
- **Zig-Zag Numbered Service Rows** (SBK-B) — lookbook feel, alternating image side, big 01–06.
- **Tier Comparison Band** (Lull memberships, SBK-B Experience tiers) — 2–3 columns, one featured. *Great reuse candidate anywhere with good/better/best.*
- **Mosaic / Editorial Gallery** (Maison, Poppi, Lull, concepts) vs even grid.
- **Horizontal Reel Strip** (KNOT, Poppi, Hair Loft, Sani, SBK-B) — reels next to the booking button.
- **Marquee Strip** (KNOT, Poppi) · **Accolades/Stat Band** (Maison) · **Announcement Bar** (Maison, Lull) · **Founder/Story Split** (Maison, Poppi).
- **FAQ Accordion** (Sani, SBK, bakery) — reframes "wall of rules" policies as warm Q&A.
- **Reviews** — 3-up cards (most), neo-brutalist hard-shadow (Poppi), single big pull-quote + minis (SBK-B).

### Flow / interactive pieces
- **Build-a-Check Receipt Flow** (Lineup; bakery variant in Cakewalk/Sweet Pea) — tappable line-items → animated running total → PENDING send + .ics.
- **Back-Office Hub** (Cakewalk/Sweet Pea) — inquiry form drops into an inbox → Accept moves it to an active project → auto-fills an agenda/calendar; message thread; toasts. *Strong differentiator for any custom-order lead.*
- **Appointment Modal (concept variant)** — style (photo cards) → date → time → confirm + deposit. Solo businesses drop the stylist step. Barber = check flow instead.
- **Mobile Bottom App-Bar** (public demos) / **Check-Peek Drawer** (Lineup) / **Sticky Bottom CTA** (concepts).
- **Toast Notifications** — on booking/inquiry actions.

---

## Quick palette + type reference

| Site | Palette signature | Type pairing (display / body) |
|------|-------------------|-------------------------------|
| KNOT | clay `#c25b3a` + olive `#5b6b3a` + butter, warm earth | Space Grotesk / Instrument Serif / Inter |
| Maison Noir | ivory paper + espresso + terracotta `#c1603a` | Fraunces / Instrument Sans |
| POPPI | pink `#ff3d92` + tangerine + violet + lime, loud | Rubik / Poppins / Fredoka |
| Lull | sage `#7f9075` + sand + stone, calm | Tenor Sans / Mulish |
| The Lineup | kraft paper + barber red `#b3271e` + mustard | Anton / Bitter / Space Mono |
| Cakewalk / Sweet Pea | cream + blush + teal `#3a7d6f` + cherry `#c4432f` | Baloo 2 / Lobster Two / Manrope |
| Hair Loft | dark aubergine `#140f1b` + magenta `#ff3d8b` + copper | Anton / Space Grotesk |
| Sani | sand + gold `#b8893f` + lapis, warm-luxe goddess | Cinzel / Cormorant Garamond / Jost |
| SBK | rose `#b56b74` + champagne + cream, soft luxe | Cinzel / Playfair Display / Jost |

Recurring: **Marcellus** in footer credit (all but the bakery pair); the NEC chair-mark logo
(potrace paths in `src/lib/logoPaths.js`); NEC signature thread `--rose:#a85a76 / --plum:#413645`.

---

## Reuse ideas (bits to spread next)
- **Tier Comparison Band** → any good/better/best menu (already moved Lull→SBK Experience tiers).
- **Back-Office Hub** (Cakewalk) → any custom-order lead (events, catering, lashes-by-appt).
- **Receipt / Build-a-Check** → à-la-carte service businesses.
- **KNOT's SVG length/size guide** (in its booking flow) → any braid/extension concept.
- **SBK-B left-rail lookbook** → deep-menu studios that need to feel like a fashion house.
- **Editorial pull-quote reviews** (SBK-B) → replace tired 3-up review cards where one strong quote hits harder.

## Public vs gated
- **Public gallery** (in `content.json` demos.items, un-gated): KNOT, Maison Noir, POPPI, Lull, The Lineup, Cakewalk.
- **Gated concepts** (watermarked, password): Hair Loft `HEALTHYHAIR`, Sani `LAIDEDGES`, SBK `STITCHEDUP`, Sweet Pea `MORECAKE`.
