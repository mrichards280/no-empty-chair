// Posts that went up in the last few days, with their public links, at /social/recent.json.
// Read by the Center Control companion app so friends and family can open each post and
// like it. Only already-public post links and the first line of the caption go out.
import { getStore } from "@netlify/blobs";
import schedule from "../../public/social/schedule.json" with { type: "json" };
import { validateSchedule, mediaUrl, config as readConfig } from "../lib/social-publisher.mjs";

const DAYS = 4;
const CORS_ORIGINS = ["https://center-control-companion.netlify.app", "http://localhost:4321"];

export default async (req) => {
  const origin = req.headers.get("origin");
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=120",
    ...(origin && CORS_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  };
  if (req.method === "OPTIONS") return new Response(null, { headers });

  const cfg = readConfig();
  const store = getStore({ name: "social-publisher", consistency: "strong" });
  const { posts } = validateSchedule(schedule);
  const now = Date.now();
  const recent = posts.filter((p) => {
    const t = Date.parse(p.publish_at);
    return t <= now && t > now - DAYS * 86400000;
  });

  const rows = (await Promise.all(recent.map(async (p) => {
    const st = (await store.get(p.id, { type: "json" })) || {};
    const links = [];
    if (st.manual?.permalink) links.push({ platform: "instagram", url: st.manual.permalink });
    for (const pl of ["instagram", "facebook"]) {
      const s = st[pl];
      if (s?.status === "published" && s.permalink && !links.some((l) => l.platform === pl)) links.push({ platform: pl, url: s.permalink });
    }
    if (!links.length) return null;
    const postedAt = st.manual?.postedAt || p.publish_at;
    const m0 = p.media?.[0] ? mediaUrl(p.media[0], cfg) : null;
    // a still frame for videos: Cloudinary serves a .jpg of the frame 2 seconds in (frame 0 is often a plain title card)
    const isVid = m0 && /\.(mp4|mov)(\?|$)/i.test(m0);
    const thumb = !m0 ? null : !isVid ? m0 : /res\.cloudinary\.com\/.+\/video\/upload\//.test(m0) ? m0.replace("/video/upload/", "/video/upload/so_2/").replace(/\.(mp4|mov)(\?.*)?$/i, ".jpg") : null;
    return {
      id: p.id,
      type: p.type,
      postedAt,
      title: (p.caption || "").split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) || "",
      thumb,
      links,
    };
  }))).filter(Boolean).sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));

  return new Response(JSON.stringify({ posts: rows, updatedAt: new Date().toISOString() }), { headers });
};

export const config = { path: "/social/recent.json" };
