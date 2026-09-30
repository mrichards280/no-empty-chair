// A subscribable .ics calendar feed of manual (needs-posting-by-hand) social posts, at
// /social/calendar.ics?key=... . Subscribe once in your phone's Calendar app and it
// handles the actual reminder/notification natively — no push infrastructure needed.
//
// Gated by CALENDAR_FEED_TOKEN (a Netlify env var, separate from ADMIN_PASSWORD so a
// leaked calendar URL can't get anyone into the admin panel — worst case they see post
// captions and dates, nothing they can act on).
import { getStore } from "@netlify/blobs";
import schedule from "../../public/social/schedule.json" with { type: "json" };
import { validateSchedule } from "../lib/social-publisher.mjs";

export default async (req) => {
  const expected = Netlify.env.get("CALENDAR_FEED_TOKEN");
  const key = new URL(req.url).searchParams.get("key");
  if (!expected || key !== expected) {
    return new Response("Not found.", { status: 404 });
  }

  const store = getStore({ name: "social-publisher", consistency: "strong" });
  const { posts } = validateSchedule(schedule);
  const manual = posts.filter((p) => p.manual_only);
  const rows = await Promise.all(manual.map(async (p) => ({ ...p, state: (await store.get(p.id, { type: "json" })) || {} })));

  const site = (Netlify.env.get("URL") || "https://noemptychair.co").replace(/\/$/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//No Empty Chair//Social Publisher//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:No Empty Chair — Post It Yourself",
    "X-WR-TIMEZONE:America/New_York",
  ];

  for (const p of rows) {
    const posted = p.state.manual?.status === "posted";
    const start = new Date(p.publish_at);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 20 * 60000);
    const summary = `${posted ? "✅" : "🖐🏾"} ${p.type.toUpperCase()}: ${(p.caption || "").split("\n")[0].slice(0, 60) || "(no caption)"}`;
    const desc = [
      posted ? "Already marked posted." : "Needs posting by hand — grab the caption/media from the status page.",
      "",
      (p.caption || "").slice(0, 900),
      "",
      `${site}/admin/social`,
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.id}@noemptychair.co`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      `URL:${site}/admin/social`,
      ...(posted ? [] : ["BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(summary)}`, "END:VALARM"]),
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="no-empty-chair-social.ics"',
      "Cache-Control": "no-store",
    },
  });
};

export const config = { path: "/social/calendar.ics" };

function icsStamp(d) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function icsEscape(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
