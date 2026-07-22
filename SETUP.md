# No Empty Chair — website + editable backend

A React site (Create React App) with an `/admin` panel that edits `public/content.json`
and saves it back to GitHub through a Netlify function, which redeploys the site.
Same backend pattern as the makayla-richards portfolio, dressed in the No Empty Chair
pastel + liquid-glass theme.

---

## The one rule
`public/content.json` is owned by the **admin panel**. When you change *code*, commit only
the code files and leave `content.json` alone, or you'll overwrite whatever you edited in
`/admin`.

---

## 1. Put it on GitHub
Create a repo (e.g. `no-empty-chair`) under your account (`mrichards280`) and upload the
contents of this folder to the repo root (drag `src`, `public`, `netlify`, `package.json`,
`netlify.toml`, `.env.example` into GitHub → Add file → Upload files).

## 2. Deploy on Netlify
- Netlify → Add new site → Import from GitHub → pick the repo.
- Build command `npm run build`, publish directory `build`, functions `netlify/functions`
  (already set in `netlify.toml`). Deploy.

## 3. Environment variables (Netlify → Site config → Environment variables)
Server-only (no `REACT_APP_` prefix):
- `ADMIN_PASSWORD` — the password for `/admin`
- `GITHUB_TOKEN` — fine-grained token, this repo only, **Contents: Read & write**
- `GITHUB_OWNER` = `mrichards280`
- `GITHUB_REPO` = `no-empty-chair`
- `GITHUB_BRANCH` = `main`
- `CONTACT_TO_EMAIL` = `info@noemptychair.co` (where contact-form notes go)
- `RESEND_API_KEY` — optional, from resend.com, to actually email you the contact form

Public (safe to expose, enables photo uploads in admin):
- `REACT_APP_CLOUDINARY_CLOUD_NAME`
- `REACT_APP_CLOUDINARY_UPLOAD_PRESET` (an **unsigned** preset)

Redeploy after setting env vars (they only apply to new deploys).

## 4. Connect noemptychair.co (DNS is at Cloudflare)
In Netlify → Domain management, add `noemptychair.co`. Netlify shows the exact records.
In Cloudflare DNS add what it gives you, typically:
- `A` record, name `@`, value = Netlify's load-balancer IP (Netlify shows it), **DNS only** (grey cloud)
- `CNAME`, name `www`, value = `your-site.netlify.app`, **DNS only**

Leave all the email records (MX, SPF, DKIM, DMARC) exactly as they are — they're unrelated
to the website.

## 5. Photo uploads (optional but nice)
Make a free Cloudinary account → create an **unsigned** upload preset → put the cloud name
and preset name in the two `REACT_APP_CLOUDINARY_*` env vars. Then the admin can upload the
founder photo and work thumbnails directly. Without it, you can still paste image URLs.

---

## Editing your site
Go to `https://noemptychair.co/admin`, sign in with `ADMIN_PASSWORD`, expand any section,
edit the fields, and click **Save & Deploy**. The site rebuilds in about a minute.

Every package and consult card has a **Book** button that opens a prefilled email to
`info@noemptychair.co`. The teardown is **$100** and credits toward another service.

## Local dev (optional)
`npm install` then `npm start`. Functions need `netlify dev` (install the Netlify CLI) and
the env vars in a local `.env` to work locally; on the deployed site they just work.
