// Saves public/social/hashtags.json back to GitHub — reusable hashtag sets for
// the social composer. Same auth/write pattern as save-schedule.mjs.
//
// Body: { password, hashtags }              -> saves { sets: [{name, tags}] }
//       { password, hashtags, verifyOnly: true } -> validate only, no write
import crypto from "node:crypto";

const FILE_PATH = "public/social/hashtags.json";

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
  const { password, hashtags, verifyOnly } = body;

  const ADMIN_PASSWORD = Netlify.env.get("ADMIN_PASSWORD");
  if (!ADMIN_PASSWORD) return json(500, { error: "ADMIN_PASSWORD is not set on the server." });
  if (!password || !passwordMatches(password, ADMIN_PASSWORD)) {
    failedAttempts++;
    if (failedAttempts >= MAX_ATTEMPTS) { lockedUntil = Date.now() + LOCKOUT_MS; failedAttempts = 0; }
    return json(401, { error: "Wrong password." });
  }
  failedAttempts = 0;
  if (verifyOnly) return json(200, { ok: true });

  const sets = hashtags?.sets;
  if (!Array.isArray(sets) || sets.some((s) => typeof s?.name !== "string" || typeof s?.tags !== "string")) {
    return json(400, { error: "Missing or malformed hashtags (expected { sets: [{name, tags}] })." });
  }

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

    const encoded = Buffer.from(JSON.stringify({ sets }, null, 2) + "\n", "utf8").toString("base64");
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Update saved hashtag sets via admin", content: encoded, branch, ...(sha ? { sha } : {}) }),
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
