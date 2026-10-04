// Server-side auth wall for /admin so the CMS editor is never publicly
// reachable (it was only noindex'd before). Credentials are checked at the edge
// and never ship to the client. Reuses the ADMIN_PASSWORD env var that
// save-content already validates. Username can be anything; password must match.
//
// A correct Basic-auth login also sets a signed 30-day cookie (see
// netlify/lib/admin-session.mjs) so that device stays signed in; the cookie is
// accepted in place of the password prompt.
//
// If ADMIN_PASSWORD is unset in the environment this returns 401 (fail closed),
// so /admin is never accidentally left open.
import { hasValidSession, issueSessionCookie } from "../lib/admin-session.mjs";

export default async (request, context) => {
  const expected =
    (globalThis.Netlify && Netlify.env && Netlify.env.get && Netlify.env.get("ADMIN_PASSWORD")) ||
    (globalThis.Deno && Deno.env && Deno.env.get && Deno.env.get("ADMIN_PASSWORD"));

  if (expected) {
    if (await hasValidSession(request.headers.get("cookie"), expected)) return context.next();

    const header = request.headers.get("authorization") || "";
    const [scheme, encoded] = header.split(" ");
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = atob(encoded);
        const pass = decoded.slice(decoded.indexOf(":") + 1);
        if (pass === expected) {
          const res = await context.next();
          try {
            // Re-wrap so the headers are guaranteed mutable.
            const out = new Response(res.body, res);
            out.headers.append("set-cookie", await issueSessionCookie(expected));
            return out;
          } catch (_) { return res; /* cookie is a convenience, never block login */ }
        }
      } catch (_) { /* fall through to challenge */ }
    }
  }
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="No Empty Chair Admin", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};

export const config = { path: ["/admin", "/admin/*"] };
