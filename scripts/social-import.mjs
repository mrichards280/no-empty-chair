#!/usr/bin/env node
// Import a content calendar into public/social/schedule.json and copy its media into
// public/social/media (PNG/WebP/HEIC images are converted to JPEG for Instagram).
//
//   npm run social:import -- <calendar.csv|calendar.json> [--media <folder>] [--replace] [--ready]
//   npm run social:check     (validate public/social/schedule.json only)
//
// CSV columns (header row, any order, case-insensitive):
//   date        2026-10-05            (Eastern time is assumed)
//   time        12:00 or 12:00 PM
//   type        image | carousel | reel | story
//   platforms   "instagram, facebook"  (blank = both)
//   media       file names or URLs, separated by | or ;  (carousel order = listed order)
//   caption     full caption text
//   caption_facebook   optional different caption for Facebook
//   status      ready | draft | paused  (blank = draft, or ready with --ready)
//   id          optional; generated from date + first media file if blank
//
// JSON input can be {posts:[...]} or [...] using the same field names, or
// schedule-style entries that already have publish_at.
//
// Media files are looked up in --media <folder>, then next to the calendar file.
// URLs (Cloudinary etc.) are left as-is.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateSchedule } from "../netlify/lib/social-publisher.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEDULE = path.join(ROOT, "public/social/schedule.json");
const MEDIA_DIR = path.join(ROOT, "public/social/media");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

if (flag("--check") || !args.length) {
  const s = JSON.parse(fs.readFileSync(SCHEDULE, "utf8"));
  report(s);
  process.exit(validateSchedule(s).problems.length ? 1 : 0);
}

const input = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--media");
const mediaFrom = opt("--media") || path.dirname(path.resolve(input));
const raw = fs.readFileSync(input, "utf8");
const rows = input.toLowerCase().endsWith(".json") ? jsonRows(JSON.parse(raw)) : csvRows(raw);

fs.mkdirSync(MEDIA_DIR, { recursive: true });
const current = JSON.parse(fs.readFileSync(SCHEDULE, "utf8"));
const byId = new Map((flag("--replace") ? [] : current.posts).map((p) => [p.id, p]));

for (const r of rows) {
  const media = splitList(r.media, /[|;\n]/).map(bringMedia);
  const publish_at = r.publish_at || easternISO(r.date, r.time);
  const id = r.id || slug(`${publish_at.slice(0, 10)}-${path.parse(media[0] || "post").name}`);
  const post = {
    id,
    publish_at,
    type: (r.type || "image").toLowerCase().trim(),
    platforms: r.platforms ? splitList(r.platforms, /[,;|\s]+/).map((p) => p.toLowerCase().replace(/^(ig|insta)$/, "instagram").replace(/^fb$/, "facebook")) : ["instagram", "facebook"],
    media,
    caption: r.caption || "",
    ...(r.caption_facebook ? { caption_facebook: r.caption_facebook } : {}),
    ...(r.cover ? { cover: bringMedia(r.cover) } : {}),
    status: (r.status || (flag("--ready") ? "ready" : "draft")).toLowerCase().trim(),
  };
  byId.set(id, post);
}

const next = { ...current, posts: [...byId.values()].sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at)) };
fs.writeFileSync(SCHEDULE, JSON.stringify(next, null, 2) + "\n");
console.log(`Wrote ${rows.length} post(s) to public/social/schedule.json (${next.posts.length} total).`);
report(next);

// ------------------------------------------------------------------ helpers

function report(s) {
  const { posts, problems } = validateSchedule(s);
  const ready = posts.filter((p) => p.status === "ready").length;
  console.log(`${posts.length} posts, ${ready} ready, ${posts.length - ready} draft/paused.`);
  if (problems.length) {
    console.log("\nFix before these can publish:");
    for (const p of problems) console.log(`  ${p.id}: ${p.errors.join("; ")}`);
  } else console.log("Schedule is valid.");
}

function bringMedia(m) {
  m = m.trim();
  if (!m || /^https?:\/\//i.test(m)) return m;
  const src = [path.resolve(mediaFrom, m), path.resolve(m)].find((p) => fs.existsSync(p));
  if (!src) { console.warn(`  ! media not found: ${m} (looked in ${mediaFrom})`); return m; }
  const { name, ext } = path.parse(src);
  const safe = slug(name);
  if (/\.(png|webp|heic|heif|tiff?|gif)$/i.test(ext)) {
    const out = `${safe}.jpg`;
    toJpeg(src, path.join(MEDIA_DIR, out));
    return out;
  }
  const out = `${safe}${ext.toLowerCase() === ".jpeg" ? ".jpg" : ext.toLowerCase()}`;
  fs.copyFileSync(src, path.join(MEDIA_DIR, out));
  return out;
}

function toJpeg(src, dest) {
  try { // macOS built-in
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", src, "--out", dest], { stdio: "ignore" });
    return;
  } catch {}
  try { // ImageMagick
    execFileSync("magick", [src, "-quality", "92", "-background", "white", "-flatten", dest], { stdio: "ignore" });
    return;
  } catch {}
  try {
    execFileSync("convert", [src, "-quality", "92", "-background", "white", "-flatten", dest], { stdio: "ignore" });
    return;
  } catch {}
  throw new Error(`Could not convert ${src} to JPEG (needs macOS sips or ImageMagick). Export it as .jpg instead.`);
}

// "2026-10-05" + "12:00 PM" in America/New_York -> ISO with the right offset (handles DST).
function easternISO(date, time = "12:00") {
  if (!date) throw new Error("row is missing a date");
  const d = new Date(date.trim());
  const [y, mo, da] = /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim().split("-").map(Number) : [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  const m = String(time).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) throw new Error(`bad time: ${time}`);
  let h = Number(m[1]) % (m[3] ? 12 : 24);
  if (m[3]?.toLowerCase() === "pm") h += 12;
  const min = Number(m[2] || 0);
  const guess = Date.UTC(y, mo - 1, da, h, min);
  const offMin = tzOffset(guess);
  const pad = (n) => String(n).padStart(2, "0");
  const sign = offMin <= 0 ? "-" : "+";
  const a = Math.abs(offMin);
  return `${y}-${pad(mo)}-${pad(da)}T${pad(h)}:${pad(min)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
function tzOffset(utcMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((asUTC - utcMs) / 60000);
}

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); }
function splitList(s, re) { return String(s || "").split(re).map((x) => x.trim()).filter(Boolean); }

function jsonRows(j) { return (Array.isArray(j) ? j : j.posts || []).map((p) => ({ ...p, media: Array.isArray(p.media) ? p.media.join("|") : p.media, platforms: Array.isArray(p.platforms) ? p.platforms.join(",") : p.platforms })); }

function csvRows(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
