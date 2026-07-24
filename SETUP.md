# No Empty Chair — website + editable backend

An **Astro** site (static output) with an `/admin` panel that edits
`public/content.json` and saves it back to GitHub through a Netlify function,
which redeploys the site. The marketing page is prerendered to complete static
HTML (great for SEO and AI crawlers); the few interactive pieces are React
"islands." Dressed in the No Empty Chair pastel + liquid-glass theme.

---

## The one rule
`public/content.json` is owned by the **admin panel**. When you change *code*,
commit only the code files and leave `content.json` alone, or you'll overwrite
whatever you edited in `/admin`. (If you do edit code while the admin also saved,
`git pull`/rebase first — the admin commits land on `main` as
"Update content.json via admin".)

---

## Stack at a glance
- **Astro** static output (`output: 'static'`), `@astrojs/react` for islands.
- Marketing homepage (`src/pages/index.astro`) renders every section from
  `content.json` at build time.
- Interactive islands: contact form, "On our radar?" popup, `/teardown` intake,
  and the `/admin` editor. FAQ accordion, demo gallery, and the logo/animation
  bits are tiny inline vanilla scripts.
- Netlify Functions in `netlify/functions/` (**`.cjs`** — CommonJS, because
  `package.json` has `"type": "module"`): `save-content.cjs`, `contact.cjs`.
- Netlify Forms: `leads` (popup) and `teardown` (intake page).
- Four standalone demo sites in `public/demos/*.html`.

## The logo & animations
- The brand mark's path data lives in **`src/lib/logoPaths.js`** and is shared by
  `ChairMark.astro` (hero, nav, footer), `ChairMark.jsx` (popup, teardown) and
  the companion-doc clip art. **One file to change if the logo changes.**
  Source art: `../Brand/logo/primary/nec-mark-primary.svg`.
- The chair line and orb are separate elements so they can be coloured
  independently (light version in the footer) and animated on their own.
- **Hero intro** (~4s, once per session via `sessionStorage`): the mark holds at
  4× while the orb swishes into the seat, shrinks into place, then the copy and
  buttons rise out of it. The copy is always in the HTML — only opacity animates,
  so SEO/crawlers are unaffected.
- **Orb swish** uses `linear` timing with a projectile trajectory sampled every
  10%. Don't switch it to a cubic-bezier — easing re-applies between *every*
  keyframe pair and makes the ball hesitate at each waypoint.
- **Rotating orb colours**: hero and nav cycle the palette over 30s; the
  companion doc cycles the light end only (contrast on its rose header).
- **Chairs band** under the hero strip: five real brand marks whose orbs drop in
  one by one. **Demos gallery**: natively scrollable (swipe/drag/trackpad) with
  auto-advance that pauses on interaction and resumes when idle.
- All of the above respect `prefers-reduced-motion`.

---

## 1. GitHub
Repo: `github.com/mrichards280/no-empty-chair`, branch `main`. Netlify
auto-deploys from `main`.

## 2. Deploy on Netlify
- Site: `no-empty-chair` (team "Makayla's Dashboard").
- Build command `npm run build`, **publish directory `dist`**, functions
  `netlify/functions` (all set in `netlify.toml`). `NODE_VERSION = 20`.

## 3. Environment variables (Netlify → Site config → Environment variables)
Server-only (read by the Functions, never sent to the browser):
- `ADMIN_PASSWORD` — the password for `/admin`
- `GITHUB_TOKEN` — fine-grained token, this repo only, **Contents: Read & write**
- `GITHUB_OWNER` = `mrichards280`
- `GITHUB_REPO` = `no-empty-chair`
- `GITHUB_BRANCH` = `main`
- `CONTACT_TO_EMAIL` — where contact-form notes go
- `RESEND_API_KEY` — optional, from resend.com, to actually email the contact form

Public — Astro exposes browser vars with the **`PUBLIC_`** prefix (CRA used
`REACT_APP_`). These enable photo uploads in admin:
- `PUBLIC_CLOUDINARY_CLOUD_NAME` = `djrmz717j`
- `PUBLIC_CLOUDINARY_UPLOAD_PRESET` = `noemptychair` (an **unsigned** preset)

Env-var changes only apply to **new** deploys — redeploy after changing them.

## 4. Domain (DNS at Cloudflare)
`noemptychair.co` → Netlify. Cloudflare DNS: `A @ → 75.2.60.5` and
`CNAME www → no-empty-chair.netlify.app`, both **DNS only** (grey cloud).
Leave all email records (MX, SPF, DKIM, DMARC) alone.

## 5. Photo uploads (optional but nice)
Cloudinary cloud `djrmz717j`, unsigned preset `noemptychair`, wired via the two
`PUBLIC_CLOUDINARY_*` vars. Without them you can still paste image URLs in admin.

---

## Editing your site
Go to `https://noemptychair.co/admin`, sign in with `ADMIN_PASSWORD`, expand any
section, edit the fields, and click **Save & Deploy**. The site rebuilds in about
a minute. The editor is generic over `content.json`, so it automatically picks up
any keys (packages, consults incl. the `$50` companion-doc `addonNote`, à la carte,
demos, etc.).

Every package and consult card has a **Book** button that opens a prefilled email
to `info@noemptychair.co`. Every project starts with the **$200 teardown**, which
credits toward another service. DIY sessions are **$300**.

## Local dev
```
npm install
npm run dev      # Astro dev server (http://localhost:4321)
```
To exercise the Netlify Functions/Forms locally, use `netlify dev` (install the
Netlify CLI) with the env vars in a local `.env`. On the deployed site they just
work.

Build locally with `npm run build` (outputs to `dist/`); preview with
`npm run preview`.

## Rollback
Netlify → Deploys → pick a previous deploy → **Publish deploy**. Instant revert;
old code stays in git history.

## Navigation
The nav bar is `logo` + `.navright` (which holds `.navlinks`, the "Book now"
button, and `.navtoggle`). It behaves differently either side of **820px**:

- **Desktop:** `.navlinks` is a horizontal row. The Services submenu opens on
  hover, on `:focus-within`, **or** when `.menutop[aria-expanded="true"]`.
- **≤820px:** `.navtoggle` (the menu button) appears and `.navlinks` becomes a
  drop-down panel, shown only when `nav.open`. The submenu renders inline
  instead of floating. "Book now" stays visible in the bar.

**Services is a `<button>`, not a link — keep it that way.** It carries
`aria-expanded` / `aria-haspopup` / `aria-controls`. As a link it navigated to
`#services` on tap, which meant the submenu was unreachable on touch devices.
The first submenu item ("Full Packages") points at `#services`, so nothing was
lost. The script also handles **layered Escape** (first closes the submenu and
refocuses Services, second closes the menu and refocuses the toggle), outside
clicks, link clicks, and resets state when crossing the breakpoint.

⚠️ **The mobile bar is tight.** Logo + CTA + menu button have to fit inside
`100vw − 2×--gutter` (≈346px on a 390px phone). The media query shrinks the logo
(`clamp(15px, 4.3vw, 22px)`, `white-space: nowrap`) and the CTA to make room — if
you enlarge any of them, the logo wraps and collides with the button.

## Accessibility
The site targets **WCAG 2.1 AA**. What's built in:
- `<main>` landmark on every page + a keyboard skip link (`Base.astro`).
- A real menu button below 820px (see **Navigation** above) — the nav links used
  to be `display: none` with no replacement, so mobile visitors couldn't reach
  Services/Results/Demos/About/FAQ at all.
- Real labels on every form control; honeypots are `aria-hidden`.
- Visible `:focus-visible` rings (cream on dark surfaces).
- The demos gallery has an explicit **pause/play** control (WCAG 2.2.2) — hover
  pause alone doesn't satisfy this, since it's unreachable by keyboard/touch.
- The radar popup traps Tab, moves focus in on open, and restores it on close.
  Note the floating tab *unmounts* while the dialog is open, so the restore
  falls back to re-querying `.radar-fab` rather than the saved node.
- Every animation respects `prefers-reduced-motion`.

**Colour contrast.** Brand rose (`#a85a76`) and gold (`#b98a52`) fail AA at small
sizes (4.19:1 and 2.7:1 on cream). The tokens `--rose-text`, `--gold-text` and
`--gold-deep` hold the passing shades and are applied **only to text** — see the
"WCAG AA contrast" block in `index.css`. Logos, orbs, gradients and bullets keep
the original colours. **If you add new text in rose or gold, use the `-text`
tokens.**

There's also a **higher-contrast mode**: `html.hc`, toggled from the footer and
persisted in `localStorage`, plus an automatic `@media (prefers-contrast: more)`.

Re-audit after changes by running the contrast/landmark checks in a browser
console, and do a manual VoiceOver + keyboard-only pass before any big launch.
