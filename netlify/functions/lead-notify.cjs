// Direct lead-notify BACKUP. The lead forms POST here on submit (fire-and-forget),
// so every lead reaches you by email EVEN IF Netlify Forms flags the submission
// as spam (Netlify's own notification never fires for spam-flagged entries).
// Env: RESEND_API_KEY (required to actually send) · LEAD_TO_EMAIL (default hello@noemptychair.co)

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Bad JSON" });
  }

  const form = (data._form || "lead").toString().slice(0, 40);
  const skip = new Set(["_form", "bot-field", "form-name"]);
  const lines = Object.keys(data)
    .filter((k) => !skip.has(k))
    .map((k) => {
      let v = data[k];
      if (Array.isArray(v)) v = v.join(", ");
      return `${k}: ${(v == null ? "" : String(v)).slice(0, 2000)}`;
    });

  const who = (data.name || data.business_name || data.email || "someone").toString().slice(0, 120);
  const to = process.env.LEAD_TO_EMAIL || "hello@noemptychair.co";
  const KEY = process.env.RESEND_API_KEY;

  // Without a key the site still works; it just can't send. (Netlify's own
  // notification still covers the non-spam case.)
  if (!KEY) return json(200, { ok: true, note: "no RESEND_API_KEY set; email skipped" });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "No Empty Chair Leads <onboarding@resend.dev>",
        to: [to],
        reply_to: data.email || undefined,
        subject: `New ${form} lead — ${who}`,
        text:
          `A new ${form} submission just came in:\n\n` +
          lines.join("\n") +
          `\n\n— Sent directly by the site as a backup, independent of Netlify's spam filter. ` +
          `The full entry is also in Netlify → Forms → ${form} (check the Spam tab if it's not under Verified).`,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json(502, { error: t.slice(0, 160) });
    }
  } catch (e) {
    return json(500, { error: e.message });
  }

  return json(200, { ok: true });
};

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
