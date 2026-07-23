// Saves public/content.json back to the GitHub repo, which triggers a Netlify
// redeploy. The admin password is checked SERVER-SIDE here, so it never ships
// to the browser. Env vars (Netlify -> Site config -> Environment variables):
//   ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH
//
// Body: { password, content }  -> saves
//       { password, verifyOnly: true } -> just checks the password (login)

const FILE_PATH = "public/content.json";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Bad JSON" });
  }

  const { password, content, verifyOnly } = body;

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    return json(500, { error: "ADMIN_PASSWORD is not set on the server." });
  }
  if (!password || password !== ADMIN_PASSWORD) {
    return json(401, { error: "Wrong password." });
  }

  if (verifyOnly) {
    return json(200, { ok: true });
  }

  if (!content || typeof content !== "object") {
    return json(400, { error: "Missing content." });
  }

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) {
    return json(500, { error: "GitHub env vars are not fully configured." });
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${FILE_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "no-empty-chair-admin",
  };

  try {
    // get current SHA (needed to update an existing file)
    let sha;
    const getRes = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (getRes.ok) {
      const cur = await getRes.json();
      sha = cur.sha;
    } else if (getRes.status !== 404) {
      const t = await getRes.text();
      return json(502, { error: `GitHub read failed (${getRes.status}): ${t.slice(0, 200)}` });
    }

    const encoded = Buffer.from(JSON.stringify(content, null, 2) + "\n", "utf8").toString("base64");
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Update content.json via admin",
        content: encoded,
        branch,
        ...(sha ? { sha } : {}),
      }),
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

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
