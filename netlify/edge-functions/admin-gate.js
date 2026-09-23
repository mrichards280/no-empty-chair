// Server-side Basic Auth wall for /admin so the CMS editor is never publicly
// reachable (it was only noindex'd before). Credentials are checked at the edge
// and never ship to the client. Reuses the ADMIN_PASSWORD env var that
// save-content already validates. Username can be anything; password must match.
//
// If ADMIN_PASSWORD is unset in the environment this returns 401 (fail closed),
// so /admin is never accidentally left open.
export default async (request, context) => {
  const expected =
    (globalThis.Netlify && Netlify.env && Netlify.env.get && Netlify.env.get("ADMIN_PASSWORD")) ||
    (globalThis.Deno && Deno.env && Deno.env.get && Deno.env.get("ADMIN_PASSWORD"));

  const header = request.headers.get("authorization") || "";
  if (expected) {
    const [scheme, encoded] = header.split(" ");
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = atob(encoded);
        const pass = decoded.slice(decoded.indexOf(":") + 1);
        if (pass === expected) return context.next();
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
