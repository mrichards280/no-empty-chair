// Saves public/social/schedule.json back to the GitHub repo, which triggers a
// Netlify redeploy — same pattern as save-content.cjs, reusing the same
// ADMIN_PASSWORD/GITHUB_* env vars. The password is checked SERVER-SIDE here,
// so it never ships to the browser, and the admin composer reuses the same
// login as the content editor (no second password).
//
// Body: { password, schedule }              -> validates + saves
//       { password, schedule, verifyOnly: true } -> validate only, no write
import crypto from "node:crypto";
import { validateSchedule } from "../lib/social-publisher.mjs";

const FILE_PATH = "public/social/schedule.json";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
let failedAttempts = 0;
let lockedUntil = 0;

function passwordMatches(candidate, expected) {
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (Date.now() < lockedUntil) return json(429, { error: "Too many attempts. Try again in a few minutes." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Bad JSON" }); }
  const { password, schedule, verifyOnly } = body;

  const ADMIN_PASSWORD = Netlify.env.get("ADMIN_PASSWORD");
  if (!ADMIN_PASSWORD) return json(500, { error: "ADMIN_PASSWORD is not set on the server." });
  if (!password || !passwordMatches(password, ADMIN_PASSWORD)) {
    failedAttempts++;
    if (failedAttempts >= MAX_ATTEMPTS) { lockedUntil = Date.now() + LOCKOUT_MS; failedAttempts = 0; }
    return json(401, { error: "Wrong password." });
  }
  failedAttempts = 0;
  if (verifyOnly) return json(200, { ok: true });

  if (!schedule || typeof schedule !== "object" || !Array.isArray(schedule.posts)) {
    return json(400, { error: "Missing or malformed schedule (expected { posts: [...] })." });
  }
  const { problems } = validateSchedule(schedule);
  if (problems.length) return json(400, { error: "Schedule has problems and was not saved.", problems });

  const owner = Netlify.env.get("GITHUB_OWNER");
  const repo = Netlify.env.get("GITHUB_REPO");
  const branch = Netlify.env.get("GITHUB_BRANCH") || "main";
  const token = Netlify.env.get("GITHUB_TOKEN");
  if (!owner || !repo || !token) return json(500, { error: "GitHub env vars are not fully configured." });

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${FILE_PATH}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "no-empty-chair-admin" };

  try {
    let sha;
    const getRes = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (getRes.ok) sha = (await getRes.json()).sha;
    else if (getRes.status !== 404) {
      const t = await getRes.text();
      return json(502, { error: `GitHub read failed (${getRes.status}): ${t.slice(0, 200)}` });
    }

    const encoded = Buffer.from(JSON.stringify(schedule, null, 2) + "\n", "utf8").toString("base64");
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Update social schedule via admin", content: encoded, branch, ...(sha ? { sha } : {}) }),
    });
    if (!putRes.ok) {
      const t = await putRes.text();
      return json(502, { error: `GitHub write failed (${putRes.status}): ${t.slice(0, 200)}` });
    }
    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
