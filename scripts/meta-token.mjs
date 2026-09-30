#!/usr/bin/env node
// One-time helper: turn a short-lived User token from Graph API Explorer into the
// never-expiring Page token + IDs the social publisher needs.
//
// Easiest: create .env.local (gitignored) in the repo root with:
//   META_APP_ID=...
//   META_APP_SECRET=...
//   META_USER_TOKEN=...
// then run:  node --env-file=.env.local scripts/meta-token.mjs
// Delete .env.local when you're done — it holds live secrets.
//
// Or inline, no file:
//   META_APP_ID=... META_APP_SECRET=... node scripts/meta-token.mjs <short-lived-user-token>
//
// Prints META_PAGE_ID, META_PAGE_TOKEN, META_IG_USER_ID to paste into Netlify env vars.
// Nothing is written to disk by this script. Never commit these values (this repo is public).
const V = process.env.META_GRAPH_VERSION || "v25.0";
const { META_APP_ID: id, META_APP_SECRET: secret } = process.env;
const short = process.argv[2] || process.env.META_USER_TOKEN;
if (!id || !secret || !short) {
  console.error("Usage: node --env-file=.env.local scripts/meta-token.mjs  (see file header for the .env.local format)");
  process.exit(1);
}
const g = async (p, q) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${p}?${new URLSearchParams(q)}`);
  const j = await r.json();
  if (j.error) throw new Error(`${p}: ${j.error.message}`);
  return j;
};

const long = await g("oauth/access_token", { grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short });
const pages = await g("me/accounts", { access_token: long.access_token, fields: "id,name,access_token,tasks,instagram_business_account{id,username}" });
if (!pages.data?.length) throw new Error("No Pages returned. When generating the token, make sure the No Empty Chair Page was selected.");

for (const p of pages.data) {
  const dbg = await g("debug_token", { input_token: p.access_token, access_token: `${id}|${secret}` });
  const exp = dbg.data?.expires_at ? new Date(dbg.data.expires_at * 1000).toISOString() : "never";
  console.log(`\n=== ${p.name} ===`);
  console.log(`Page token expires: ${exp}`);
  if (exp !== "never") console.log(`⚠️  NOT never-expiring — do not use this one for the live scheduler. Something went wrong in the exchange (check META_APP_ID/META_APP_SECRET are right).`);
  console.log(`Scopes: ${(dbg.data?.scopes || []).join(", ")}`);
  console.log(`Can create content: ${(p.tasks || []).includes("CREATE_CONTENT")}`);
  console.log(`\n↓↓↓ COPY ONLY THESE THREE LINES INTO NETLIFY — nowhere else has the real values ↓↓↓`);
  console.log(`META_PAGE_ID=${p.id}`);
  console.log(`META_PAGE_TOKEN=${p.access_token}`);
  console.log(p.instagram_business_account ? `META_IG_USER_ID=${p.instagram_business_account.id}   (@${p.instagram_business_account.username})` : "META_IG_USER_ID=  (no Instagram professional account linked to this Page)");
  console.log(`↑↑↑ NOT from .env.local, NOT from the Explorer's Access Token box — only from these three lines, right here ↑↑↑`);
}
