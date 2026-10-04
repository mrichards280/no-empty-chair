// "Stay signed in" for /admin. After a correct Basic-auth login the edge gate hands the
// browser a signed cookie (30 days) so it never has to ask again on that device. Web APIs
// only, so it runs in both the Deno edge gate and the Node functions.
//
// The cookie is `v1.<expiry>.<hmac>`, HMAC-SHA256 keyed by ADMIN_PASSWORD. It can't be
// forged without the password, and changing ADMIN_PASSWORD signs every device out at once.
const TTL_SECONDS = 30 * 24 * 60 * 60;
const COOKIE = "nec_admin";
const enc = new TextEncoder();

async function sign(data, password) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueSessionCookie(password) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const body = `v1.${exp}`;
  const value = `${body}.${await sign(body, password)}`;
  return `${COOKIE}=${value}; Path=/admin; Max-Age=${TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export async function hasValidSession(cookieHeader, password) {
  if (!password || !cookieHeader) return false;
  const m = String(cookieHeader).split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE + "="));
  if (!m) return false;
  const parts = m.slice(COOKIE.length + 1).split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(parts[2], await sign(`v1.${parts[1]}`, password));
}
