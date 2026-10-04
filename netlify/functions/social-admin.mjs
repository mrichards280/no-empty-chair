// Status page + manual controls for the social publisher, at /admin/social.
// Behind the /admin Basic-Auth edge gate, and re-checks ADMIN_PASSWORD here (fails closed).
//   GET  /admin/social            status page
//   GET  /admin/social?format=json
//   POST /admin/social  {action: "verify" | "dry-run" | "run" | "retry" | "refresh-stats", id?, platform?}
import { getStore } from "@netlify/blobs";
import schedule from "../../public/social/schedule.json" with { type: "json" };
import { runTick, makeGraph, config as readConfig, validateSchedule, verifyConnection, mediaUrl, refreshAllStats, matchManualLinks, pushNotify } from "../lib/social-publisher.mjs";
import { hasValidSession } from "../lib/admin-session.mjs";

export default async (req) => {
  const expected = Netlify.env.get("ADMIN_PASSWORD");
  if (!expected || !(authorized(req.headers.get("authorization"), expected) || await hasValidSession(req.headers.get("cookie"), expected))) {
    return new Response("Authentication required.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="No Empty Chair Admin", charset="UTF-8"' } });
  }
  const cfg = readConfig();
  const store = getStore({ name: "social-publisher", consistency: "strong" });
  const graph = makeGraph(cfg);

  if (req.method === "POST") {
    // A cookie session is sent automatically by the browser, so refuse cross-site POSTs.
    const origin = req.headers.get("origin");
    if (origin) { let same = false; try { same = new URL(origin).host === new URL(req.url).host; } catch {} if (!same) return json({ error: "cross-site request refused" }, 403); }
    let body = {};
    try { body = await req.json(); } catch {}
    if (body.action === "verify") return json(await verifyConnection(graph, cfg));
    if (body.action === "dry-run") return json(await runTick({ schedule, store, graph, cfg, dryRun: true }));
    if (body.action === "run") {
      const r = await runTick({ schedule, store, graph, cfg, onlyId: body.id });
      await store.setJSON("_lastRun", r);
      return json(r);
    }
    if (body.action === "retry" && body.id && body.platform) {
      const cur = (await store.get(body.id, { type: "json" })) || {};
      delete cur[body.platform];
      await store.setJSON(body.id, cur);
      const r = await runTick({ schedule, store, graph, cfg, onlyId: body.id });
      await store.setJSON("_lastRun", r);
      return json(r);
    }
    if (body.action === "dismiss" && body.id && body.platform) {
      const cur = (await store.get(body.id, { type: "json" })) || {};
      if (cur[body.platform]) cur[body.platform] = { ...cur[body.platform], dismissed: !body.undo };
      await store.setJSON(body.id, cur);
      return json({ ok: true });
    }
    if (body.action === "mark-manual" && body.id) {
      const cur = (await store.get(body.id, { type: "json" })) || {};
      const link = typeof body.permalink === "string" ? body.permalink.trim() : "";
      if (link && !/^https?:\/\//i.test(link)) return json({ error: "That doesn't look like a link. Paste the full https:// post link." }, 400);
      if (body.undo) { delete cur.manual; delete cur.linkCheck; }
      else cur.manual = {
        ...(cur.manual || {}),
        status: "posted",
        postedAt: cur.manual?.postedAt || new Date().toISOString(),
        ...(link ? { permalink: link } : {}),
      };
      // Marking posted (re)starts the link search: this is check #1, then 10 min, then 30 min.
      if (!body.undo && !cur.manual.permalink) cur.linkCheck = { fails: 0, nextAt: 0 };
      await store.setJSON(body.id, cur);
      let found = null;
      if (!body.undo && !cur.manual.permalink) { try { found = (await matchManualLinks({ schedule, store, graph, cfg, onlyId: body.id })).matched.find((m) => m.id === body.id) || null; } catch {} }
      return json({ ok: true, linkFound: !!found });
    }
    if (body.action === "test-push") {
      const r = await pushNotify(cfg, { title: "✅ Test from No Empty Chair", message: "Phone alerts are working. You'll get one of these when posts publish, fail, or need posting by hand.", tags: ["white_check_mark"], priority: 3 });
      return json(r.sent ? { ok: true } : { ok: false, error: r.reason || ("ntfy answered " + r.status) }, r.sent ? 200 : 400);
    }
    if (body.action === "refresh-stats") {
      let links = { matched: [] };
      try { links = await matchManualLinks({ schedule, store, graph, cfg, force: true }); } catch (e) { links = { matched: [], error: e.message }; }
      return json({ results: await refreshAllStats({ schedule, store, graph }), manualLinks: links });
    }
    return json({ error: "unknown action" }, 400);
  }

  const { posts, problems } = validateSchedule(schedule);
  const rows = await Promise.all(posts.map(async (p) => ({ ...p, state: (await store.get(p.id, { type: "json" })) || {} })));
  const lastRun = await store.get("_lastRun", { type: "json" });
  const calToken = Netlify.env.get("CALENDAR_FEED_TOKEN");
  const site = (Netlify.env.get("URL") || "https://noemptychair.co").replace(/\/$/, "");
  const calendarUrl = calToken ? `${site}/social/calendar.ics?key=${encodeURIComponent(calToken)}` : null;
  const data = { enabled: cfg.enabled, lastRun, problems, posts: rows, calendarUrl, pushEnabled: !!cfg.ntfyTopic };
  if (new URL(req.url).searchParams.get("format") === "json") return json(data);
  return new Response(page(data, cfg), { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
};

export const config = { path: "/admin/social" };

function authorized(header, expected) {
  const [scheme, enc] = (header || "").split(" ");
  if (scheme !== "Basic" || !enc) return false;
  try { const d = atob(enc); return d.slice(d.indexOf(":") + 1) === expected; } catch { return false; }
}
const json = (o, s = 200) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const num = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : null);
function timeAgo(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const TYPE_ICON = { image: "🖼️", carousel: "🔲", reel: "🎬", story: "📖" };

// Likes/comments/reach line plus the latest comments, for a post's saved stats.
function statsHtml(stats) {
  if (!stats) return "";
  const line = `<div class="stats">${[
    stats.postedAt ? `posted ${esc(timeAgo(stats.postedAt))}` : null,
    num(stats.likes) !== null ? `❤️ ${num(stats.likes)}` : null,
    num(stats.comments) !== null ? `💬 ${num(stats.comments)}` : null,
    num(stats.reach) !== null ? `👁 ${num(stats.reach)} reach` : null,
    num(stats.plays) !== null ? `▶ ${num(stats.plays)} plays` : null,
    num(stats.saved) !== null ? `🔖 ${num(stats.saved)}` : null,
    num(stats.post_impressions) !== null ? `👁 ${num(stats.post_impressions)} impr.` : null,
    num(stats.post_engaged_users) !== null ? `⚡ ${num(stats.post_engaged_users)} engaged` : null,
  ].filter(Boolean).join(" · ")}<span class="muted"> (as of ${esc(timeAgo(stats.fetchedAt))})</span></div>`;
  const comments = stats.recentComments?.length
    ? `<div class="commentlist">${stats.recentComments.map((c) => `<div class="commentrow"><b>@${esc(c.username || "?")}</b> ${esc(c.text || "")}</div>`).join("")}</div>`
    : "";
  return line + comments;
}

// Which tab a post lives in. A post sits in exactly one:
//   attention = a platform failed/missed (needs a human)    published = all done
//   needs     = manual post still to be posted by hand      scheduled = auto-publishes on its own
//   draft     = draft or paused (won't go out until it's set to ready)
function catOf(p) {
  const st = p.state || {};
  const plats = p.platforms || [];
  if (p.manual_only) {
    if (st.manual?.status === "posted") return "published";
  } else {
    const live = plats.filter((pl) => !st[pl]?.dismissed);
    const ss = live.map((pl) => st[pl]?.status);
    if (ss.some((x) => x === "failed" || x === "missed")) return "attention";
    if (live.length && ss.every((x) => x === "published")) return "published";
  }
  const status = p.status || "draft";
  if (status !== "ready") return "draft";
  return p.manual_only ? "needs" : "scheduled";
}

function page(d, cfg) {
  const badge = (st, p, id) => {
    const s = st?.status || "scheduled";
    const link = st?.permalink ? ` <a href="${esc(st.permalink)}" target="_blank" rel="noopener">view ↗</a>` : "";
    const err = st?.error || st?.lastError ? `<div class="err">${esc(st.error || st.lastError)}</div>` : "";
    const retry = ["failed", "missed"].includes(s)
      ? ` <button class="mini" data-retry="${esc(id)}" data-platform="${p}">Retry</button>` + (st?.dismissed
          ? ` <span class="muted">dismissed</span> <button class="mini" data-dismiss="${esc(id)}" data-platform="${p}" data-undo="1">Undo</button>`
          : ` <button class="mini" data-dismiss="${esc(id)}" data-platform="${p}">Dismiss</button>`)
      : "";
    const statsBlock = statsHtml(st?.stats);
    const ac = p === "instagram" ? st?.autoComment : null;
    const acLine = ac
      ? ac.status === "pending" ? `<div class="muted">🕐 first comment queued for ${esc(fmt(new Date(ac.dueAt).toISOString()))}</div>`
      : ac.status === "posted" ? `<div class="muted">💬 first comment posted ${esc(timeAgo(ac.postedAt))}</div>`
      : `<div class="err">first comment failed: ${esc(ac.error || "")}</div>`
      : "";
    return `<div class="platrow"><span class="platchip pc-${p}">${p === "instagram" ? "IG" : "FB"}</span> <span class="s s-${s}">${s}</span>${link}${retry}${err}${statsBlock}${acLine}</div>`;
  };

  const sorted = d.posts.slice().sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));
  const counts = {};
  for (const p of sorted) { const c = catOf(p); counts[c] = (counts[c] || 0) + 1; }
  const tabDefs = [
    ...(counts.attention ? [{ key: "attention", label: "⚠️ Needs attention" }] : []),
    { key: "needs", label: "🖐🏾 Needs posting" },
    { key: "scheduled", label: "🗓 Scheduled" },
    { key: "draft", label: "📝 Drafts & paused" },
    { key: "published", label: "✅ Published" },
    { key: "all", label: "All" },
  ];
  const defaultTab = counts.attention ? "attention" : counts.needs ? "needs" : counts.scheduled ? "scheduled" : "all";
  const cards = sorted.map((p) => {
    const media0 = p.media?.[0] || "";
    const isVid = /\.(mp4|mov)(\?|#|$)/i.test(media0);
    const src = media0 ? esc(mediaUrl(media0, cfg)) : "";
    const thumb = media0
      ? (isVid ? `<video src="${src}" muted playsinline preload="metadata"></video>` : `<img src="${src}" alt="">`)
      : `<div class="pthumb-empty">${TYPE_ICON[p.type] || "🖼️"}</div>`;
    const fullCap = p.caption || "";
    const capBlock = p.manual_only
      ? `<div class="pcap pcap-full">${esc(fullCap) || `<span class="muted">no caption</span>`}</div>`
      : !fullCap ? `<div class="pcap"><span class="muted">no caption</span></div>`
      : fullCap.length <= 100 ? `<div class="pcap">${esc(fullCap)}</div>`
      : `<div class="pcap"><span class="capshort">${esc(fullCap.slice(0, 100))}… <span class="more" data-capexpand="1">more</span></span><span class="capfull" hidden>${esc(fullCap)}</span></div>`;
    const allPublished = !p.manual_only && p.platforms.length && p.platforms.every((pl) => p.state[pl]?.status === "published");
    const canPostNow = !p.manual_only && (p.status || "draft") === "ready" && !allPublished;
    const needsPosting = p.manual_only && (p.status || "draft") === "ready" && p.state.manual?.status !== "posted";
    const cat = catOf(p);
    const overdue = cat === "needs" && Date.parse(p.publish_at) < Date.now();
    return `
    <div class="pcard" data-manual="${p.manual_only ? "1" : "0"}" data-needs-posting="${needsPosting ? "1" : "0"}" data-status="${esc(p.status || "draft")}" data-cat="${cat}" data-ts="${Date.parse(p.publish_at) || 0}">
      <a class="pthumb" href="${src || "#"}" target="_blank" rel="noopener">${thumb}</a>
      <div class="pbody">
        <div class="prow1">
          <b>${esc(fmt(p.publish_at))}</b>
          ${overdue ? `<span class="pill st-overdue">overdue</span>` : `<span class="pill st-${esc(p.status || "draft")}">${esc(p.status || "draft")}</span>`}
        </div>
        <div class="ptype">${TYPE_ICON[p.type] || ""} ${esc(p.type)}${p.campaign ? ` <span class="campaign">🏷 ${esc(p.campaign)}</span>` : ""}</div>
        ${capBlock}
        <div class="prow2">
          <button class="mini" data-preview="${esc(p.id)}">👁 Preview</button>
          <button class="mini" data-copycap="${esc(p.id)}">📋 Copy caption</button>
          ${isVid && media0 ? `<button class="mini" data-savevideo="${src}" data-savename="${esc(p.id)}.mp4">⬇ Save video</button>` : ""}
          ${p.manual_only ? (p.state.manual?.status === "posted"
            ? `<button class="mini" data-markmanual="${esc(p.id)}" data-undo="1">↺ Undo posted</button>`
            : `<button class="mini markdone" data-markmanual="${esc(p.id)}">✓ Mark posted</button>`) : ""}
          ${canPostNow ? `<button class="mini postnow" data-postnow="${esc(p.id)}">▶ Post now</button>` : ""}
        </div>
        <div class="pplatforms">${p.manual_only
          ? (p.state.manual?.status === "posted"
              ? `<div class="manual posted">✅ Posted ${esc(timeAgo(p.state.manual.postedAt))}${p.state.manual.autoDetected ? " <span class=\"muted\">(found on Instagram automatically)</span>" : ""}${p.state.manual.permalink ? ` · <a href="${esc(p.state.manual.permalink)}" target="_blank" rel="noopener">view ↗</a>` : p.state.linkCheck?.gaveUp ? ` <span class="nolink">⚠ couldn't find the link automatically</span> <button class="mini" data-addlink="${esc(p.id)}">＋ Add link</button>` : ` <span class="muted">🔎 looking for the link${p.state.linkCheck?.nextAt ? ` · next check ${esc(fmt(new Date(p.state.linkCheck.nextAt).toISOString()))}` : ""}</span> <button class="mini" data-addlink="${esc(p.id)}">＋ Add link</button>`}</div>${statsHtml(p.state.manual.stats)}`
              : `<div class="manual">🖐🏾 Manual — needs stickers/polls/sound tag added in-app, post it yourself</div>`)
          : p.platforms.map((pl) => badge(p.state[pl], pl, p.id)).join("")}</div>
      </div>
    </div>`;
  }).join("");

  // Data for the client-side preview modal: full media list resolved to absolute URLs,
  // since the modal has no server round-trip. "</" is escaped as a JSON solidus escape
  // so a caption containing the literal text "</script>" can't break out of the tag.
  const previewData = JSON.stringify(
    sorted.map((p) => ({
      id: p.id,
      type: p.type,
      platforms: p.platforms,
      manual_only: !!p.manual_only,
      publish_at: p.publish_at,
      caption: p.caption || "",
      caption_facebook: p.caption_facebook ?? p.caption ?? "",
      media: (p.media || []).map((m) => mediaUrl(m, cfg)),
    }))
  ).replace(/<\//g, "<\\/");

  const empty = `
    <div class="emptystate">
      <div class="emptyicon">📭</div>
      <h3>Nothing scheduled yet</h3>
      <p>Add your first post from the <a href="/admin">Social calendar</a> tab in Admin — once it's saved and marked "ready," it'll show up here.</p>
    </div>`;

  const probs = d.problems.length ? `<div class="warn"><b>Schedule problems (these posts will not go out):</b><ul>${d.problems.map((p) => `<li>${esc(p.id)}: ${esc(p.errors.join("; "))}</li>`).join("")}</ul></div>` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Social publisher</title>
<link rel="manifest" href="/social/manifest.json">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="NEC Social">
<meta name="theme-color" content="#413645">
<style>
:root{--plum:#413645;--rose:#a85a76;--cream:#faf6f2;--line:#e7dfe3}
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 system-ui,-apple-system,sans-serif;background:linear-gradient(160deg,#faf6f2,#f3edf6 60%,#f0f6f0);color:var(--plum);min-height:100vh}
.wrap{max-width:1000px;margin:0 auto;padding:28px clamp(16px,4vw,32px) 60px}
.backlink{display:inline-block;color:#8a7f86;font-size:13px;text-decoration:none;margin-bottom:10px}
.backlink:hover{color:var(--rose)}
.pageheader{background:rgba(255,255,255,.7);backdrop-filter:blur(12px);border:1px solid var(--line);border-radius:18px;padding:20px 24px;margin-bottom:18px;box-shadow:0 10px 30px rgba(65,54,69,.06)}
h1{font-family:'Cinzel',Georgia,serif;font-size:24px;margin:0 0 8px}
.sub{color:#6e6172;font-size:13px;margin:0}
.muted{color:#8a7f86;font-size:12px}.cap{max-width:380px}
.actionbar{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 18px}
button,a.mini{font:inherit;font-weight:600;letter-spacing:.02em;font-size:13px;border:1px solid var(--line);background:#fff;color:var(--plum);padding:10px 18px;border-radius:100px;cursor:pointer;box-shadow:0 1px 3px rgba(65,54,69,.06)}
button:hover{background:#f8f4fb;border-color:#e2d6ea}
button.primary{background:var(--plum);color:#fff;border-color:var(--plum)}
button.primary:hover{background:#54465a}
.mini{padding:3px 10px;font-size:11px;box-shadow:none}
.mini.loading,button.loading{position:relative;color:transparent!important;pointer-events:none}
.mini.loading::after,button.loading::after{content:"";position:absolute;inset:0;margin:auto;width:12px;height:12px;border:2px solid currentColor;border-color:var(--plum) var(--plum) transparent transparent;border-radius:50%;animation:spin .6s linear infinite;color:var(--plum)}
button.primary.loading::after{border-color:#fff #fff transparent transparent}
@keyframes spin{to{transform:rotate(360deg)}}
.pill{display:inline-block;padding:2px 11px;border-radius:100px;font-size:12px;font-weight:600}
.on{background:#dff3e6;color:#1d6b3a}.off{background:#f6e3e3;color:#8c2f2f}
.st-ready{background:#dff3e6;color:#1d6b3a}.st-draft{background:#eee;color:#666}.st-paused{background:#fff1d6;color:#7a5200}
.emptystate{background:rgba(255,255,255,.6);border:1px dashed #e2d6ea;border-radius:18px;padding:48px 24px;text-align:center;color:#8a7f86}
.emptyicon{font-size:36px;margin-bottom:10px}
.emptystate h3{font-family:'Cinzel',Georgia,serif;color:var(--plum);margin:0 0 8px;font-size:18px}
.emptystate p{margin:0;font-size:14px;max-width:420px;margin:0 auto}
.emptystate a{color:var(--rose);font-weight:600;text-decoration:none}
.emptystate a:hover{text-decoration:underline}
.filterbar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
.filterchip{background:#fff;border:1px solid var(--line);padding:8px 14px;border-radius:100px;font-size:13px;font-weight:700;color:#6e6172;cursor:pointer}
.filterchip span{opacity:.65;font-weight:400;margin-left:2px}
.filterchip.active{background:var(--plum);color:#fff;border-color:var(--plum)}
.filterchip.active span{opacity:.8}
.pgrid{display:grid;gap:12px}
.pcard{display:flex;gap:14px;background:rgba(255,255,255,.7);border:1px solid var(--line);border-radius:16px;padding:14px;box-shadow:0 4px 14px rgba(65,54,69,.05)}
.pcard.filtered-out{display:none}
.pcard[data-manual="1"]{border-color:#f0d69a;background:rgba(255,249,235,.65)}
.pthumb{width:76px;height:76px;flex-shrink:0;border-radius:12px;overflow:hidden;background:#efe8f2;display:block}
.pthumb img,.pthumb video{width:100%;height:100%;object-fit:cover;display:block}
.pthumb-empty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:26px}
.pbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.prow1{display:flex;justify-content:space-between;align-items:center;gap:8px}
.ptype{text-transform:capitalize;font-size:12px;color:#8a7f86}
.campaign{color:var(--rose);font-weight:600;text-transform:none}
.pcap{font-size:13px;color:var(--plum)}
.pcap-full{white-space:pre-wrap;line-height:1.5;background:rgba(255,255,255,.6);border-radius:10px;padding:10px 12px;margin:2px 0}
.prow2{margin-top:2px;display:flex;flex-wrap:wrap;gap:8px}
.prow2 .mini{text-decoration:none;display:inline-block}
.copied{background:#dff3e6!important;color:#1d6b3a!important;border-color:#bfe6cf!important}
.pplatforms{margin-top:4px;display:flex;flex-direction:column;gap:4px}
.platrow{font-size:13px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.platchip{font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;color:#fff}
.pc-instagram{background:linear-gradient(45deg,#f09433,#dc2743,#bc1888)}
.pc-facebook{background:#1877f2}
.s{font-size:11px;font-weight:600;padding:1px 9px;border-radius:100px;background:#eee}
.s-published{background:#dff3e6;color:#1d6b3a}.s-failed,.s-missed{background:#f6e3e3;color:#8c2f2f}.s-processing{background:#fff1d6;color:#7a5200}
.err{color:#8c2f2f;font-size:12px;max-width:340px}
.warn{background:#fff1d6;border-radius:14px;padding:14px 18px;margin:0 0 16px;font-size:14px}
.manual{color:#7a5200;font-size:13px}
.manual.posted{color:#1d6b3a}
.manual.posted a{color:#1d6b3a;font-weight:600}
button.markdone{background:#dff3e6;color:#1d6b3a;border-color:#bfe6cf}
button.postnow{background:var(--plum);color:#fff;border-color:var(--plum)}
button.postnow:disabled{opacity:.6}
.stats{font-size:11px;color:#5a3f4e}
.st-overdue{background:#f6e3e3;color:#8c2f2f}
.nolink{color:#8c2f2f;font-weight:600;font-size:12px}
.tabempty{margin:10px 0;padding:28px 18px}
.commentlist{margin-top:4px;padding-left:10px;border-left:2px solid var(--line)}
.commentrow{font-size:11px;color:#5a3f4e;line-height:1.5}
.commentrow b{color:var(--plum)}
.outbox{background:rgba(255,255,255,.85);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-top:20px;box-shadow:0 4px 14px rgba(65,54,69,.05)}
.outbox pre{margin:0;font-size:12px;white-space:pre-wrap;overflow:auto;max-height:340px}
.checkhead{font-weight:600;margin-bottom:10px}
.checkrow{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}
.checkrow:last-child{border-bottom:none}
.checkrow.bad b{color:#8c2f2f}
.modalbg{position:fixed;inset:0;background:rgba(40,32,42,.55);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;z-index:50}
.modalbg[hidden]{display:none}
.modalbox{background:#fff;border-radius:20px;max-width:420px;width:100%;padding:18px;position:relative;box-shadow:0 20px 60px rgba(40,32,42,.35)}
.modalclose{position:absolute;top:10px;right:10px;border:none;background:#f1ebf3;color:var(--plum);width:30px;height:30px;border-radius:100px;cursor:pointer;font-size:14px;line-height:1}
.modaltabs{display:flex;gap:8px;margin:0 0 14px;padding-right:34px}
.modaltab{border:1px solid var(--line);background:#fff;color:#8a7f86;padding:6px 14px;border-radius:100px;font-size:12px;font-weight:700;cursor:pointer}
.modaltab.active{background:var(--plum);color:#fff;border-color:var(--plum)}
.modalmeta{font-size:11px;color:#8a7f86;margin:-8px 0 12px;text-align:center}
.igmock,.fbmock{border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;font-family:-apple-system,system-ui,sans-serif;color:#262626}
.igmock-head,.fbmock-head{display:flex;align-items:center;gap:9px;padding:10px 12px}
.igmock-avatar,.fbmock-avatar,.storymock-avatar,.reelmock-avatar{width:32px;height:32px;border-radius:100px;background:linear-gradient(45deg,#f09433,#dc2743,#bc1888);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0}
.fbmock-avatar{background:#1877f2}
.igmock-head b,.fbmock-head b{font-size:13px}
.igmock-sub,.fbmock-sub{font-size:11px;color:#8e8e8e}
.igmock-media,.fbmock-media{width:100%;aspect-ratio:4/5;background:#efe8f2;overflow-x:auto;display:flex;scroll-snap-type:x mandatory}
.igmock-media img,.igmock-media video,.fbmock-media img,.fbmock-media video{width:100%;height:100%;object-fit:cover;flex-shrink:0;scroll-snap-align:start}
.igmock-dots{text-align:center;font-size:10px;color:#8e8e8e;padding:6px 0 0}
.igmock-icons{padding:10px 12px 2px;font-size:19px;letter-spacing:10px}
.igmock-cap{padding:6px 12px 14px;font-size:13px;line-height:1.4}
.igmock-cap b{margin-right:5px}
.igmock-cap .more{color:#8e8e8e;cursor:pointer;font-weight:600}
.fbmock-msg{padding:0 12px 10px;font-size:14px;line-height:1.45;white-space:pre-wrap}
.fbmock-icons{display:flex;gap:16px;padding:9px 12px;border-top:1px solid #eee;font-size:12px;color:#65676b;font-weight:600}
.storymock,.reelmock{display:flex;justify-content:center}
.storymock-frame,.reelmock-frame{position:relative;width:220px;aspect-ratio:9/16;border-radius:20px;overflow:hidden;background:#000;box-shadow:0 6px 20px rgba(0,0,0,.3)}
.storymock-frame img,.storymock-frame video,.reelmock-frame video{width:100%;height:100%;object-fit:cover;display:block}
.storymock-bar{position:absolute;top:8px;left:8px;right:8px;height:3px;background:rgba(255,255,255,.35);border-radius:3px}
.storymock-bar::after{content:"";display:block;width:60%;height:100%;background:#fff;border-radius:3px}
.storymock-head{position:absolute;top:16px;left:10px;right:10px;display:flex;align-items:center;gap:6px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5);font-size:11px}
.storymock-head b{font-size:12px}
.storymock-sticker{position:absolute;left:10px;right:10px;bottom:14px;background:rgba(255,255,255,.96);border-radius:12px;padding:10px 12px;font-size:10.5px;line-height:1.5;color:var(--plum);white-space:pre-wrap;max-height:55%;overflow:auto}
.storymock-sticker .tag{display:inline-block;background:var(--rose);color:#fff;font-weight:700;font-size:9px;padding:1px 8px;border-radius:100px;margin-bottom:5px}
.reelmock-side{position:absolute;right:8px;bottom:70px;display:flex;flex-direction:column;gap:14px;color:#fff;font-size:17px;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.reelmock-bottom{position:absolute;left:10px;right:40px;bottom:14px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5);font-size:11px;line-height:1.4}
.reelmock-bottom b{display:block;margin-bottom:3px;font-size:12px}
@media (max-width:560px){
  .wrap{padding:18px 14px 50px}
  .pageheader{padding:16px 18px}
  h1{font-size:20px}
  .actionbar button{flex:1 1 30%;min-width:0;padding:12px 8px;font-size:12px}
  .pcard{flex-direction:column}
  .pthumb{width:100%;height:auto;aspect-ratio:4/5;max-height:280px}
  .prow2 .mini,.prow2 .mini[href]{flex:1;text-align:center;padding:10px 8px}
  .filterchip{flex:1;text-align:center}
  .modalbox{max-width:100%;padding:16px}
}
</style></head><body><div class="wrap">
<a class="backlink" href="/admin">← Back to Admin</a>
<div class="pageheader">
  <h1>📅 Social publisher</h1>
  <p class="sub">Auto-posting is <span class="pill ${d.enabled ? "on" : "off"}">${d.enabled ? "ON" : "PAUSED"}</span>
  · checks every 10 minutes · last run ${d.lastRun ? esc(fmt(d.lastRun.at)) + (d.lastRun.skipped ? " (" + esc(d.lastRun.skipped) + ")" : "") : "never"} · times shown in Eastern</p>
  <p class="sub">${d.pushEnabled ? "📲 Phone alerts are <b>ON</b> — you'll get a notification when a post publishes, fails, or needs posting by hand." : `📲 Phone alerts are <b>off</b> — add an NTFY_TOPIC env var and subscribe to it in the free ntfy app to get them.`}</p>
  ${d.calendarUrl ? `<p class="sub"><a href="${esc(d.calendarUrl)}">📅 Subscribe to the "needs posting" calendar</a> — add it once in your phone's Calendar app for native reminders. Add this page to your home screen (Share → Add to Home Screen) for one-tap access.</p>` : `<p class="sub muted">Calendar reminders aren't set up yet — add a CALENDAR_FEED_TOKEN env var to enable the subscribe link.</p>`}
</div>
<div class="actionbar">
  <button data-act="verify">🔌 Check connection</button>
  <button data-act="dry-run">🧪 Dry run</button>
  <button class="primary" data-act="run">▶ Run now</button>
  <button data-act="refresh-stats">↻ Refresh stats</button>
  ${d.pushEnabled ? `<button data-act="test-push">📲 Send test alert</button>` : ""}
</div>
${probs}
${sorted.length ? `<div class="filterbar">
  ${tabDefs.map((t) => `<button class="filterchip${t.key === defaultTab ? " active" : ""}" data-filter="${t.key}">${t.label} <span>${counts[t.key] ?? sorted.length}</span></button>`).join("")}
</div>
<div class="emptystate tabempty" id="tabEmpty" hidden><p>Nothing here right now.</p></div>` : ""}
${sorted.length ? `<div class="pgrid">${cards}</div>` : empty}
<div id="out" class="outbox" hidden></div>
<div id="previewModal" class="modalbg" hidden><div class="modalbox">
  <button class="modalclose" id="previewClose">✕</button>
  <div id="previewTabs"></div>
  <div id="previewMeta" class="modalmeta"></div>
  <div id="previewBody"></div>
</div></div>
<script type="application/json" id="postsData">${previewData}</script>
<script>
const out=document.getElementById('out');
function escHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function render(action,data){
  if(action==='verify' && Array.isArray(data.checks)){
    return '<div class="checkhead">Connection check <span class="muted">(v'+escHtml(data.version||'')+' · auto-posting '+(data.enabled?'ON':'PAUSED')+')</span></div>'
      + data.checks.map(c=>'<div class="checkrow '+(c.ok?'ok':'bad')+'">'+(c.ok?'✅':'❌')+' <b>'+escHtml(c.name)+'</b> <span class="muted">'+escHtml(c.detail||'')+'</span></div>').join('');
  }
  return '<pre>'+escHtml(JSON.stringify(data,null,2))+'</pre>';
}
async function go(body){out.hidden=false;out.innerHTML='Working…';
 try{
   const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   let data; try{data=await r.json();}catch{throw new Error('Server returned '+r.status+' '+r.statusText+' (not JSON) — it may have timed out mid-publish. Check again in a minute before retrying.');}
   if(!r.ok) throw new Error(data?.error || ('Request failed: '+r.status));
   out.innerHTML=render(body.action,data);
   return data;
 }catch(err){
   out.innerHTML='<div class="checkrow bad">❌ '+escHtml(err.message||String(err))+'</div>';
   throw err;
 }
}
document.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{b.classList.add('loading');try{await go({action:b.dataset.act});}catch{}finally{b.classList.remove('loading');}if(b.dataset.act==='refresh-stats')setTimeout(()=>location.reload(),600);});
document.querySelectorAll('[data-retry]').forEach(b=>b.onclick=async()=>{b.classList.add('loading');try{await go({action:'retry',id:b.dataset.retry,platform:b.dataset.platform});setTimeout(()=>location.reload(),600);}catch{b.classList.remove('loading');}});

// ---- preview modal ----
const POSTS=JSON.parse(document.getElementById('postsData').textContent);
const modal=document.getElementById('previewModal'), tabsEl=document.getElementById('previewTabs'), metaEl=document.getElementById('previewMeta'), bodyEl=document.getElementById('previewBody');
const isVid=m=>/\\.(mp4|mov)(\\?|#|$)/i.test(m);
const fmtModal=iso=>{try{return new Date(iso).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return iso;}};
function mediaTag(url,cls){return isVid(url)?'<video src="'+url+'" preload="metadata" '+(cls==='reelmock'?'controls':'muted loop autoplay playsinline')+'></video>':'<img src="'+url+'" alt="">';}
function igCard(post){
  const media=post.media.map(m=>mediaTag(m,'igmock')).join('');
  const dots=post.media.length>1?'<div class="igmock-dots">'+post.media.map((_,i)=>i===0?'●':'○').join(' ')+'</div>':'';
  const full=escHtml(post.caption), short=escHtml(post.caption.slice(0,140));
  const cap=post.caption.length>140
    ? '<span class="capshort">'+short+'… <span class="more" data-expand="1">more</span></span><span class="capfull" hidden>'+full+'</span>'
    : full;
  return '<div class="igmock"><div class="igmock-head"><div class="igmock-avatar">N</div><div><b>noemptychair</b><div class="igmock-sub">'+escHtml(post.type)+'</div></div></div>'
    +'<div class="igmock-media">'+media+'</div>'+dots
    +'<div class="igmock-icons">♡ 💬 ➤</div>'
    +'<div class="igmock-cap"><b>noemptychair</b>'+cap+'</div></div>';
}
function fbCard(post){
  const media=post.media.map(m=>mediaTag(m,'fbmock')).join('');
  return '<div class="fbmock"><div class="fbmock-head"><div class="fbmock-avatar">N</div><div><b>No Empty Chair</b><div class="fbmock-sub">Just now · 🌐</div></div></div>'
    +'<div class="fbmock-msg">'+escHtml(post.caption_facebook)+'</div>'
    +'<div class="fbmock-media">'+media+'</div>'
    +'<div class="fbmock-icons"><span>👍🏾 Like</span><span>💬 Comment</span><span>↗ Share</span></div></div>';
}
function storyCard(post){
  return '<div class="storymock"><div class="storymock-frame">'
    +mediaTag(post.media[0],'storymock')
    +'<div class="storymock-bar"></div>'
    +'<div class="storymock-head"><div class="storymock-avatar" style="width:22px;height:22px;font-size:10px">N</div><b>noemptychair</b></div>'
    +'<div class="storymock-sticker"><span class="tag">🖐🏾 add sticker in-app</span>'+escHtml(post.caption)+'</div>'
    +'</div></div>';
}
function reelCard(post,caption){
  return '<div class="reelmock"><div class="reelmock-frame">'
    +mediaTag(post.media[0],'reelmock')
    +'<div class="reelmock-side"><div>♡</div><div>💬</div><div>➤</div><div>⋯</div></div>'
    +'<div class="reelmock-bottom"><b>@noemptychair</b>'+escHtml(caption)+'</div>'
    +'</div></div>';
}
function renderPlatform(post,platform){
  if(post.type==='story')return storyCard(post);
  if(post.type==='reel')return reelCard(post,platform==='facebook'?post.caption_facebook:post.caption);
  return platform==='facebook'?fbCard(post):igCard(post);
}
function openPreview(id){
  const post=POSTS.find(p=>p.id===id); if(!post)return;
  metaEl.textContent=fmtModal(post.publish_at)+' · '+post.type+(post.manual_only?' · manual':'');
  const plats=post.manual_only?['instagram']:post.platforms;
  let active=plats[0];
  function draw(){
    tabsEl.innerHTML=plats.length>1?'<div class="modaltabs">'+plats.map(pl=>'<button class="modaltab'+(pl===active?' active':'')+'" data-tab="'+pl+'">'+(pl==='instagram'?'Instagram':'Facebook')+'</button>').join('')+'</div>':'';
    bodyEl.innerHTML=renderPlatform(post,active);
    tabsEl.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{active=b.dataset.tab;draw();});
    bodyEl.querySelectorAll('[data-expand]').forEach(b=>b.onclick=()=>{
      const wrap=b.closest('.igmock-cap');
      wrap.querySelector('.capshort').hidden=true;
      wrap.querySelector('.capfull').hidden=false;
    });
  }
  draw();
  modal.hidden=false;
}
document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>openPreview(b.dataset.preview));
document.getElementById('previewClose').onclick=()=>{modal.hidden=true;};
modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true;});

// ---- expand a truncated caption in the card list ----
document.querySelectorAll('[data-capexpand]').forEach(b=>b.onclick=()=>{
  const wrap=b.closest('.pcap');
  wrap.querySelector('.capshort').hidden=true;
  wrap.querySelector('.capfull').hidden=false;
});

// ---- copy caption (grabs the full caption/instructions straight from POSTS) ----
document.querySelectorAll('[data-copycap]').forEach(b=>b.onclick=async()=>{
  const post=POSTS.find(p=>p.id===b.dataset.copycap); if(!post)return;
  try{
    await navigator.clipboard.writeText(post.caption||'');
    const original=b.textContent;
    b.textContent='✓ Copied';
    b.classList.add('copied');
    setTimeout(()=>{b.textContent=original;b.classList.remove('copied');},1400);
  }catch{}
});

// ---- save video ----
// A plain <a download> is ignored for cross-origin files (Cloudinary) in Safari and some
// Chromium builds, so the video is fetched as a blob first.
//  * Phones/tablets (Safari, Chrome, Edge mobile): hand the file to the native share sheet,
//    which has a real "Save Video". Browsers only allow that right after a tap, so if the
//    download took long enough that the tap expired, the button becomes "Ready - tap to
//    save" and the second tap (file already cached) opens the sheet.
//  * Desktop (Edge, Chrome, Firefox, Safari): a normal same-origin blob download to the
//    Downloads folder; no share dialog.
const savedFiles=new Map();
const isTouchDevice=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Mac/i.test(navigator.platform));
document.querySelectorAll('[data-savevideo]').forEach(b=>{
  const original=b.textContent;
  b.onclick=async()=>{
    const url=b.dataset.savevideo, filename=b.dataset.savename||'video.mp4';
    let file=savedFiles.get(url);
    try{
      if(!file){
        b.textContent='Preparing…'; b.classList.add('loading');
        const res=await fetch(url);
        if(!res.ok)throw new Error('download failed');
        const blob=await res.blob();
        file=new File([blob],filename,{type:blob.type||'video/mp4'});
        savedFiles.set(url,file);
        b.classList.remove('loading');
      }
      if(isTouchDevice && navigator.canShare && navigator.canShare({files:[file]})){
        try{ await navigator.share({files:[file],title:filename}); b.textContent=original; }
        catch(err){ b.textContent=err&&err.name==='AbortError'?original:'✅ Ready: tap to save'; }
        return;
      }
      const objUrl=URL.createObjectURL(file);
      const a=document.createElement('a');
      a.href=objUrl; a.download=filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(objUrl),10000);
      b.textContent=original;
    }catch(err){
      b.classList.remove('loading'); b.textContent=original;
      window.open(url,'_blank');
    }
  };
});

// ---- tabs: each post lives in exactly one (attention / needs posting / scheduled / drafts / published) ----
const cardsEls=[...document.querySelectorAll('.pcard')];
const chipEls=[...document.querySelectorAll('[data-filter]')];
const TAB_KEY='necSocialTab';
function applyTab(f){
  chipEls.forEach(c=>c.classList.toggle('active',c.dataset.filter===f));
  let shown=0;
  cardsEls.forEach(card=>{
    const show=f==='all' || card.dataset.cat===f;
    card.classList.toggle('filtered-out',!show);
    if(show)shown++;
  });
  // Published reads newest-first; everything else soonest-first.
  const grid=document.querySelector('.pgrid');
  if(grid)[...cardsEls].sort((a,b)=>f==='published'?b.dataset.ts-a.dataset.ts:a.dataset.ts-b.dataset.ts).forEach(c=>grid.appendChild(c));
  const empty=document.getElementById('tabEmpty'); if(empty)empty.hidden=shown>0;
  try{localStorage.setItem(TAB_KEY,f);}catch{}
}
chipEls.forEach(chip=>chip.onclick=()=>applyTab(chip.dataset.filter));
if(chipEls.length){
  let start=(chipEls.find(c=>c.classList.contains('active'))||chipEls[0]).dataset.filter;
  try{const saved=localStorage.getItem(TAB_KEY); if(saved && chipEls.some(c=>c.dataset.filter===saved) && saved!=='attention')start=saved; else if(saved==='attention' && chipEls.some(c=>c.dataset.filter==='attention'))start='attention';}catch{}
  applyTab(start);
}

// ---- dismiss a failure you've decided to live with (e.g. Facebook won't take video posts) ----
document.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=async()=>{
  b.classList.add('loading');
  try{await go({action:'dismiss',id:b.dataset.dismiss,platform:b.dataset.platform,undo:b.dataset.undo?true:undefined});location.reload();}
  catch{b.classList.remove('loading');}
});

// ---- add / fix the real post link on a manual post that was marked posted without one ----
document.querySelectorAll('[data-addlink]').forEach(b=>b.onclick=async()=>{
  const url=prompt('Paste the full Instagram or Facebook post link:','');
  if(!url||!url.trim())return;
  b.classList.add('loading');
  try{await go({action:'mark-manual',id:b.dataset.addlink,permalink:url.trim()});location.reload();}
  catch{b.classList.remove('loading');}
});

// ---- mark a manual post posted / undo, with an optional real permalink for verifiable tracking ----
document.querySelectorAll('[data-markmanual]').forEach(b=>b.onclick=async()=>{
  const id=b.dataset.markmanual;
  b.classList.add('loading');
  try{
    if(b.dataset.undo){
      if(!confirm('Undo "posted"? It will show as needing posting again.')){b.classList.remove('loading');return;}
      await go({action:'mark-manual',id,undo:true});
    } else {
      const url=prompt('Paste the post or story link (Instagram app: ••• → Copy link). Leave blank and I will look for it on Instagram automatically.','');
      if(url===null){b.classList.remove('loading');return;} // cancelled
      await go({action:'mark-manual',id,permalink:url.trim()||undefined});
    }
    location.reload();
  }catch{b.classList.remove('loading');}
});

// ---- post now: publish one specific ready post immediately, regardless of its scheduled time ----
document.querySelectorAll('[data-postnow]').forEach(b=>b.onclick=async()=>{
  const id=b.dataset.postnow;
  if(!confirm('Post this right now, live, regardless of its scheduled time?'))return;
  b.disabled=true; b.classList.add('loading');
  try{
    await go({action:'run',id});
    location.reload();
  }catch{
    b.disabled=false; b.classList.remove('loading');
  }
});
</script></div></body></html>`;
}
