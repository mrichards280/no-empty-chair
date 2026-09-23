# Barbershop "Food-Menu" Site — Build Plan

A demo barbershop site styled like a **diner/soul-food menu**, where tapping a service **prints it onto a live receipt that counts up the total**. Same effect on iPhone, iPad, and desktop — each laid out to fit its screen.

## Concept & name — DECIDED
- **Name: THE LINEUP** (barber term + menu pun — the lineup of services).
- **Vibe: warm soul-food menu** — kraft/cream paper, ink, barber-red accent, wax "Barber's Pick" stamp; ATL warmth, feels like a real printed menu.
- Metaphor: a classic printed **menu**. Service groups read like menu courses; the cart reads like a **guest check / thermal receipt**.

## The menu (services + realistic ATL pricing, barber language)
Grouped like a food menu:

- **THE MAINS (cuts)** — The Regular (scissor + clipper) $30 · Skin Fade (low/mid/high, blended to skin) $35 · Taper $30 · The Buzz (one guard, in-and-out) $20 · Executive (cut + beard) $50 · Kids' Cut (10 & under) $25 · Senior/Retiree $25
- **THE SIDES (add-ons)** — Lineup / Shape-up (crisp edges) $15 · Beard Trim + razor outline $20 · Hot-Towel Straight-Razor Shave $30 · Hard Part $5 · Eyebrows $8 · Gray Blending / Enhancement $15 · Custom Design / Parts $10
- **THE COMBOS ("The Works")** — Cut + Beard + Hot Towel $65 · Cut + Lineup $40
- **ON THE HOUSE** — edge check, hot towel, "line of the day" (free, printed as $0.00 on the receipt for delight)
- **BARBER'S PICK** — a stamped daily special (e.g., "Mid-fade + beard — $55")

Descriptions use real lingo: *"low, mid, or high — blended clean to the skin," "razor-sharp lineup, edges on point," "grays gone, nobody knows," "hot towel, straight razor, the full ritual."*

## The receipt (the star interaction)
- Looks like a **thermal guest check**: monospace type, dashed rules, header `✦ GUEST CHECK ✦ / THE CHAIR — ATL`, itemized lines with **dot leaders** (`Skin Fade …… 35.00`), `SUBTOTAL`, optional `SHOP FEE`, and a big **TOTAL that animates counting up** when you add an item (and down when removed).
- Each add **prints a new line** with a short paper-feed animation; a subtle stamp/"cha-ching" (muted by default, respects reduced-motion).
- Remove a line with an `✕`; total re-tallies.
- Persists in `localStorage` for the session.
- Footer: *"No empty chair — thank you, come again."* + **SEND TO MY BARBER** button → pending confirmation (barber pick + time + tentative Google/Apple/Outlook hold), reusing our booking pattern for the schedule step.

## Responsive — same effect, fit to each screen
- **Desktop (≥1024):** menu fills the page; **receipt pinned to a sticky right rail**, always visible, printing in real time.
- **iPad (768–1023):** menu + receipt **side-by-side** (narrower rail), or receipt as a slide-in panel; the printing/counting stays on-screen.
- **iPhone (<768):** menu full-width; receipt becomes a **bottom "check" drawer** — a slim bar shows the running TOTAL + item count, tap to **expand the full receipt** (paper slides up). Same tactile printing + count-up, thumb-friendly.
- One component, three layouts via CSS grid + a breakpoint that moves the receipt between rail ↔ drawer.

## Look & feel
- **Palette:** kraft/cream menu paper `#f2e8d5`, ink `#1a1712`, barber-red accent `#c62828`, a hit of chrome/steel. (Signature NEC plum/rose woven into one detail.)
- **Type:** a bold condensed "menu board" display for headers (e.g., a tall grotesque), a warm serif or grotesque for descriptions, and a true **monospace** for the receipt (Space Mono / JetBrains Mono).
- **Details:** barber-pole divider, clipper/scissor line icons, a wax-stamp "Barber's Pick," ticket-perf edges on the receipt.

## Build approach
- Standalone `public/demos/barber.html` (served at `/demos/barber.html`), same as the other four demos; add a 5th demo card on the main site.
- **Custom lightweight cart** (add/remove, running total, count-up, localStorage) — the receipt UX is bespoke, not the booking sheet — but the **"Send to my barber"** step hooks into our existing pending-confirmation + calendar flow.
- Authentic photos (ATL Black barbershops, fades, lineups, shop interiors) sourced from Pexels, per the imagery rule.
- Accessibility: keyboard-addable items, `aria-live` on the total, reduced-motion fallback (instant totals, no paper animation).

## Phases
1. Layout shell + menu content (all services/prices/lingo) — static.
2. Receipt component + add/remove + count-up + localStorage.
3. Responsive rail ↔ drawer + polish (animations, stamp, sounds off by default).
4. "Send to my barber" pending flow + calendar holds.
5. Photos, icons, signature touches; add demo card to main site; verify iPhone/iPad/desktop.

## Open choices (my recommendations first)
- **Name:** THE CHAIR (recommended) — ties to the brand.
- **Vibe:** warm soul-food/kraft menu (recommended) vs. black-and-chrome modern barber.
- **Sound on add:** off by default with a mute/unmute toggle (recommended).
