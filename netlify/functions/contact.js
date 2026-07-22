// Handles the site contact form. If RESEND_API_KEY is set, it emails you at
// CONTACT_TO_EMAIL (default hello@noemptychair.co). Without a key it still
// accepts the message so the form works, and you can wire email later.
// Env: RESEND_API_KEY (optional), CONTACT_TO_EMAIL (optional)

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

  const name = (body.name || "").toString().slice(0, 200).trim();
  const email = (body.email || "").toString().slice(0, 200).trim();
  const message = (body.message || "").toString().slice(0, 4000).trim();

  if (!name || !email || !message) {
    return json(400, { error: "Please fill in your name, email, and message." });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(400, { error: "Please enter a valid email." });
  }

  const to = process.env.CONTACT_TO_EMAIL || "hello@noemptychair.co";
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "No Empty Chair <onboarding@resend.dev>",
          to: [to],
          reply_to: email,
          subject: `New inquiry from ${name}`,
          text: `From: ${name} <${email}>\n\n${message}`,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        return json(502, { error: `Email failed: ${t.slice(0, 160)}` });
      }
    } catch (e) {
      return json(500, { error: e.message });
    }
  }

  return json(200, { ok: true });
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
