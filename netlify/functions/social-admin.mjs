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
      try { links = await matchManualLinks({ schedule, store, graph, cfg, force: true, onlyId: body.id || undefined }); } catch (e) { links = { matched: [], error: e.message }; }
      return json({ results: await refreshAllStats({ schedule, store, graph, onlyId: body.id || undefined }), manualLinks: links });
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
    num(stats.views ?? stats.plays) !== null ? `▶ <b>${num(stats.views ?? stats.plays)} views</b>` : null,
    num(stats.reach) !== null ? `👁 ${num(stats.reach)} reach` : null,
    num(stats.likes) !== null ? `❤️ ${num(stats.likes)}` : null,
    num(stats.comments) !== null ? `💬 ${num(stats.comments)}` : null,
    num(stats.shares) !== null ? `↗ ${num(stats.shares)} shares` : null,
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
//   attention = Instagram failed/missed (needs a human)     published = all done
//   needs     = manual post still to be posted by hand      scheduled = auto-publishes on its own
//   draft     = draft or paused (won't go out until it's set to ready)
function catOf(p) {
  const st = p.state || {};
  const plats = p.platforms || [];
  if (p.manual_only) {
    if (st.manual?.status === "posted") return "published";
  } else {
    // Facebook never needs attention: a failure still shows on the card, but the post is
    // judged by its Instagram result (Facebook only counts if it's the sole platform).
    const core = plats.filter((pl) => pl !== "facebook");
    const live = (core.length ? core : plats).filter((pl) => !st[pl]?.dismissed);
    const ss = live.map((pl) => st[pl]?.status);
    if (ss.some((x) => x === "failed" || x === "missed")) return "attention";
    if (live.length && ss.every((x) => x === "published")) return "published";
  }
  const status = p.status || "draft";
  if (status !== "ready") return "draft";
  return p.manual_only ? "needs" : "scheduled";
}

// ---- Stats tab ------------------------------------------------------------------------
const STAT_METRICS = [["views", "▶", "Views"], ["reach", "👁", "Reach"], ["likes", "❤️", "Likes"], ["comments", "💬", "Comments"], ["shares", "↗", "Shares"], ["saved", "🔖", "Saves"]];
const metricVal = (s, k) => (k === "views" ? (s.views ?? s.plays) : s[k]);
const isNum = (n) => typeof n === "number" && Number.isFinite(n);

// One row per post/platform that has numbers saved.
function statRows(posts) {
  const rows = [];
  for (const p of posts) {
    const st = p.state || {};
    if (p.manual_only) { if (st.manual?.stats) rows.push({ p, pl: "instagram", s: st.manual.stats, link: st.manual.permalink }); continue; }
    for (const pl of p.platforms || []) if (st[pl]?.status === "published" && st[pl].stats) rows.push({ p, pl, s: st[pl].stats, link: st[pl].permalink || st[pl].stats.permalink });
  }
  return rows.sort((a, b) => Date.parse(b.s.postedAt || b.p.publish_at) - Date.parse(a.s.postedAt || a.p.publish_at));
}

function sparkline(hist, key) {
  const pts = (hist || []).map((h) => h[key]).filter(isNum);
  if (pts.length < 3) return "";
  const w = 84, h = 24, max = Math.max(...pts), min = Math.min(...pts), span = max - min || 1;
  const xy = pts.map((v, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${xy}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// "+3 likes · +1 comment" since about a day ago (or since tracking began).
function growthLine(s) {
  const hist = s.history || [];
  if (hist.length < 2) return "";
  const cutoff = Date.now() - 24 * 3600e3;
  const base = [...hist].reverse().find((h) => Date.parse(h.at) <= cutoff) || hist[0];
  const parts = [["likes", "like"], ["comments", "comment"], ["shares", "share"], ["saved", "save"]]
    .map(([k, w]) => { const d = (metricVal(s, k) ?? 0) - (base[k] ?? 0); return isNum(metricVal(s, k)) && isNum(base[k]) && d > 0 ? `+${d.toLocaleString("en-US")} ${w}${d === 1 ? "" : "s"}` : null; })
    .filter(Boolean);
  if (!parts.length) return "";
  return `<div class="growth">▲ ${parts.join(" · ")} <span class="muted">since ${Date.parse(base.at) <= cutoff ? "yesterday" : esc(timeAgo(base.at)) || "earlier"}</span></div>`;
}

function statsView(posts, cfg) {
  const rows = statRows(posts);
  if (!rows.length) {
    return `<section id="statsView" hidden><div class="emptystate"><div class="emptyicon">📊</div><h3>No stats yet</h3><p>Numbers show up here once a post is live. Tap Refresh stats to pull the latest.</p><p style="margin-top:14px"><button class="btn primary rose" data-act="refresh-stats">↻ Refresh stats</button></p></div></section>`;
  }
  const ig = rows.filter((r) => r.pl === "instagram"), fb = rows.filter((r) => r.pl === "facebook");
  const sum = (arr, k) => arr.reduce((t, r) => t + (Number(metricVal(r.s, k)) || 0), 0);
  const eng = (r) => ["likes", "comments", "shares", "saved"].reduce((t, k) => t + (Number(metricVal(r.s, k)) || 0), 0);
  const best = ig.slice().sort((a, b) => eng(b) - eng(a))[0];
  const newest = rows.reduce((m, r) => Math.max(m, Date.parse(r.s.fetchedAt) || 0), 0);
  const tiles = STAT_METRICS.map(([k, ic, label]) => `<div class="tile"><span>${ic}</span><b>${(sum(ig, k)).toLocaleString("en-US")}</b><i>${label}</i></div>`).join("");
  const fbLine = fb.length ? `<p class="sub">Facebook, across ${fb.length} post${fb.length === 1 ? "" : "s"}: ❤️ ${sum(fb, "likes").toLocaleString("en-US")} · 💬 ${sum(fb, "comments").toLocaleString("en-US")} · ↗ ${sum(fb, "shares").toLocaleString("en-US")}</p>` : "";
  const cards = rows.map((r) => {
    const { p, pl, s } = r;
    const m0 = p.media?.[0] || "";
    const thumb = m0 && !/\.(mp4|mov)(\?|#|$)/i.test(m0) ? `<img src="${esc(mediaUrl(m0, cfg))}" alt="">` : `<div class="pthumb-empty">${TYPE_ICON[p.type] || "🖼️"}</div>`;
    const grid = STAT_METRICS.map(([k, ic, label]) => { const v = metricVal(s, k); return `<div class="m${isNum(v) ? "" : " na"}"><span>${ic} ${label}</span><b>${isNum(v) ? v.toLocaleString("en-US") : "—"}</b></div>`; }).join("");
    const extras = [
      isNum(s.total_interactions) ? `${s.total_interactions.toLocaleString("en-US")} interactions` : null,
      isNum(s.profile_visits) ? `${s.profile_visits.toLocaleString("en-US")} profile visits` : null,
      isNum(s.follows) ? `${s.follows.toLocaleString("en-US")} new follows` : null,
      isNum(s.replies) ? `${s.replies.toLocaleString("en-US")} replies` : null,
      isNum(s.ig_reels_avg_watch_time) ? `${(s.ig_reels_avg_watch_time / 1000).toFixed(1)}s avg watch` : null,
    ].filter(Boolean).join(" · ");
    const comments = (s.recentComments || []);
    const total = isNum(s.comments) ? s.comments : comments.length;
    const commentBlock = total || comments.length
      ? `<details class="scomments"><summary>💬 ${total.toLocaleString("en-US")} comment${total === 1 ? "" : "s"}${comments.length && comments.length < total ? ` · showing latest ${comments.length}` : ""}</summary>${comments.length ? comments.map((c) => `<div class="commentrow"><b>@${esc(c.username || "?")}</b> ${esc(c.text || "")}${c.timestamp ? ` <span class="muted">· ${esc(timeAgo(c.timestamp))}</span>` : ""}${isNum(c.likes) && c.likes ? ` <span class="muted">· ❤️ ${c.likes}</span>` : ""}</div>`).join("") : `<div class="muted">The comment text isn't available yet. Tap Refresh stats.</div>`}</details>`
      : "";
    const viewsMissing = pl === "instagram" && !isNum(metricVal(s, "views"));
    const why = s.insightsError || s.insightsNote;
    const needsPerm = s.insightsError && (/\(#10\)/.test(s.insightsError) || /does not have permission|permission/i.test(s.insightsError));
    const unavailable = needsPerm ? `<div class="muted permfix">Views, reach and saves are blocked: Instagram says this app doesn't have permission to read insights. The token needs the <b>instagram_manage_insights</b> permission (Business Settings → System Users → generate a new token), then paste it into <b>META_PAGE_TOKEN</b> in Netlify.</div>`
      : s.insightsError && !isNum(s.reach) ? `<div class="muted">Reach, saves and views unavailable: ${esc(String(s.insightsError).slice(0, 160))}</div>`
      : viewsMissing ? `<div class="muted">No view count yet${s.metricTier === undefined ? " (saved before views were tracked; tap Refresh this post)" : why ? `: Instagram said "${esc(String(why).slice(0, 140))}"` : ": Instagram didn't return one for this post"}.</div>`
      : "";
    return `<article class="srow" data-ts="${Date.parse(s.postedAt || p.publish_at) || 0}" data-likes="${Number(s.likes) || 0}" data-comments="${Number(s.comments) || 0}" data-shares="${Number(s.shares) || 0}" data-reach="${Number(s.reach) || 0}" data-views="${Number(metricVal(s, "views")) || 0}">
      <div class="pthumb">${thumb}</div>
      <div class="sbody">
        <div class="prow1"><b>${esc(fmt(s.postedAt || p.publish_at))}</b><span class="platchip pc-${pl}">${pl === "instagram" ? "IG" : "FB"}</span></div>
        <div class="ptype">${TYPE_ICON[p.type] || ""} ${esc(p.type)}${p.campaign ? ` <span class="campaign">🏷 ${esc(p.campaign)}</span>` : ""}${r.link ? ` · <a href="${esc(r.link)}" target="_blank" rel="noopener">view ↗</a>` : ""}</div>
        <div class="pcap">${esc((p.caption || "").slice(0, 110))}${(p.caption || "").length > 110 ? "…" : ""}</div>
        <div class="mgrid">${grid}</div>
        ${growthLine(s)}
        <div class="sline">${extras ? `<span>${esc(extras)}</span>` : ""}${sparkline(s.history, "likes") ? `<span class="sparkwrap" title="Likes over time">${sparkline(s.history, "likes")}<i>likes over time</i></span>` : ""}<span class="muted">updated ${esc(timeAgo(s.fetchedAt) || "just now")}</span></div>
        <div class="pactions"><button class="btn sm" data-act="refresh-stats" data-id="${esc(p.id)}">↻ Refresh this post</button>${r.pl === "instagram" || p.manual_only ? `<a class="btn sm" href="/admin?repost=${encodeURIComponent(p.id)}">🔁 Schedule again</a>` : ""}</div>
        ${unavailable}
        ${commentBlock}
      </div>
    </article>`;
  }).join("");
  return `<section id="statsView" hidden aria-label="Post statistics">
    <div class="tiles">${tiles}</div>
    <p class="sub">Instagram totals across ${ig.length} post${ig.length === 1 ? "" : "s"} · reach adds up per post, so the same person can be counted twice${best ? ` · best so far: <a href="${esc(best.link || "#")}" target="_blank" rel="noopener">${esc(fmt(best.s.postedAt || best.p.publish_at))} ${esc(best.p.type)}</a> (${eng(best).toLocaleString("en-US")} likes, comments, shares and saves)` : ""}</p>
    ${fbLine}
    <div class="statbar"><label class="sub" for="statSort">Sort by</label>
      <select id="statSort"><option value="ts">Newest</option><option value="views">Most views</option><option value="likes">Most likes</option><option value="comments">Most comments</option><option value="shares">Most shares</option><option value="reach">Most reach</option></select>
      <span class="muted">Last pulled ${esc(newest ? timeAgo(new Date(newest).toISOString()) || "just now" : "never")}</span>
      <button class="btn sm" data-act="refresh-stats">↻ Refresh all now</button></div>
    <p class="sub">Updates itself: every hour for a post's first day, twice a day through day 7, then daily through day 30. Older posts update when you tap Refresh. Views are whatever Instagram reports for that post (it can lag a little).</p>
    <div class="slist">${cards}</div>
  </section>`;
}


function page(d, cfg) {
  const badge = (st, p, id) => {
    const s = st?.status || "scheduled";
    const link = st?.permalink ? ` <a href="${esc(st.permalink)}" target="_blank" rel="noopener">view ↗</a>` : "";
    const err = st?.error || st?.lastError ? `<div class="err">${esc(st.error || st.lastError)}</div>` : "";
    const retry = ["failed", "missed"].includes(s) && p === "facebook"
      ? ` <button class="btn sm quiet" data-retry="${esc(id)}" data-platform="${p}">Retry</button>`
      : ["failed", "missed"].includes(s)
      ? ` <button class="btn sm primary" data-retry="${esc(id)}" data-platform="${p}">Retry</button>` + (st?.dismissed
          ? ` <span class="muted">dismissed</span> <button class="btn sm quiet" data-dismiss="${esc(id)}" data-platform="${p}" data-undo="1">Undo</button>`
          : ` <button class="btn sm quiet" data-dismiss="${esc(id)}" data-platform="${p}">Dismiss</button>`)
      : "";
    const statsBlock = statsHtml(st?.stats);
    const ac = p === "instagram" ? st?.autoComment : null;
    const acLine = ac
      ? ac.status === "pending" ? `<div class="muted">🕐 first comment queued for ${esc(fmt(new Date(ac.dueAt).toISOString()))}</div>`
      : ac.status === "posted" ? `<div class="muted">💬 first comment posted ${esc(timeAgo(ac.postedAt))}</div>`
      : `<div class="err">first comment failed: ${esc(ac.error || "")}</div>`
      : "";
    return `<div class="platrow${p === "facebook" && ["failed", "missed"].includes(s) ? " quietfail" : ""}"><span class="platchip pc-${p}">${p === "instagram" ? "IG" : "FB"}</span> <span class="s s-${s}">${s}</span>${link}${retry}${err}${statsBlock}${acLine}</div>`;
  };

  const sorted = d.posts.slice().sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));
  const counts = {};
  for (const p of sorted) { const c = catOf(p); counts[c] = (counts[c] || 0) + 1; }
  const tabDefs = [
    ...(counts.attention ? [{ key: "attention", label: "⚠️ Needs attention" }] : []),
    { key: "needs", label: "🖐🏾 Needs posting" },
    { key: "scheduled", label: "🗓 Scheduled" },
    { key: "draft", label: "📝 Drafts" },
    { key: "published", label: "✅ Published" },
    { key: "all", label: "All" },
    { key: "calendar", label: "🗓 Calendar" },
    { key: "stats", label: "📊 Stats" },
  ];
  const statCount = statRows(sorted).length;
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
    const canPostNow = !p.manual_only && (p.status || "draft") === "ready" && !allPublished && catOf(p) !== "attention"; // failed posts get Retry instead
    const needsPosting = p.manual_only && (p.status || "draft") === "ready" && p.state.manual?.status !== "posted";
    const cat = catOf(p);
    const overdue = cat === "needs" && Date.parse(p.publish_at) < Date.now();
    return `
    <div class="pcard" data-id="${esc(p.id)}" data-manual="${p.manual_only ? "1" : "0"}" data-needs-posting="${needsPosting ? "1" : "0"}" data-status="${esc(p.status || "draft")}" data-cat="${cat}" data-ts="${Date.parse(p.publish_at) || 0}">
      <a class="pthumb" href="${src || "#"}" target="_blank" rel="noopener">${thumb}</a>
      <div class="pbody">
        <div class="prow1">
          <b>${esc(fmt(p.publish_at))}</b>
          ${overdue ? `<span class="pill st-overdue">overdue</span>` : `<span class="pill st-${esc(p.status || "draft")}">${esc(p.status || "draft")}</span>`}
        </div>
        <div class="ptype">${TYPE_ICON[p.type] || ""} ${esc(p.type)}${p.campaign ? ` <span class="campaign">🏷 ${esc(p.campaign)}</span>` : ""}</div>
        ${capBlock}
        <div class="pactions">
          ${needsPosting ? `<button class="btn sm primary rose" data-markmanual="${esc(p.id)}">✓ Mark posted</button>` : ""}
          ${canPostNow ? `<button class="btn sm primary" data-postnow="${esc(p.id)}">▶ Post now</button>` : ""}
          <button class="btn sm" data-preview="${esc(p.id)}">👁 Preview</button>
          <button class="btn sm" data-copycap="${esc(p.id)}">📋 Copy caption</button>
          ${isVid && media0 ? `<button class="btn sm" data-savevideo="${src}" data-savename="${esc(p.id)}.mp4">⬇ Save video</button>` : ""}
          ${cat === "published" ? `<a class="btn sm" href="/admin?repost=${encodeURIComponent(p.id)}">🔁 Schedule again</a>` : ""}
          ${p.manual_only && p.state.manual?.status === "posted" ? `<button class="btn sm quiet" data-markmanual="${esc(p.id)}" data-undo="1">↺ Undo posted</button>` : ""}
        </div>
        <div class="pplatforms">${p.manual_only
          ? (p.state.manual?.status === "posted"
              ? `<div class="manual posted">✅ Posted ${esc(timeAgo(p.state.manual.postedAt))}${p.state.manual.autoDetected ? " <span class=\"muted\">(found on Instagram automatically)</span>" : ""}${p.state.manual.permalink ? ` · <a href="${esc(p.state.manual.permalink)}" target="_blank" rel="noopener">view ↗</a>` : p.state.linkCheck?.gaveUp ? ` <span class="nolink">⚠ couldn't find the link automatically</span> <button class="btn sm" data-addlink="${esc(p.id)}">＋ Add link</button>` : ` <span class="muted">🔎 looking for the link${p.state.linkCheck?.nextAt ? ` · next check ${esc(fmt(new Date(p.state.linkCheck.nextAt).toISOString()))}` : ""}</span> <button class="btn sm" data-addlink="${esc(p.id)}">＋ Add link</button>`}</div>${statsHtml(p.state.manual.stats)}`
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
      cat: catOf(p),
      status: p.status || "draft",
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
@font-face{font-family:'Inter';font-weight:400;font-display:swap;src:url('/fonts/inter-400.woff2') format('woff2')}
@font-face{font-family:'Inter';font-weight:500;font-display:swap;src:url('/fonts/inter-500.woff2') format('woff2')}
@font-face{font-family:'Inter';font-weight:600;font-display:swap;src:url('/fonts/inter-600.woff2') format('woff2')}
@font-face{font-family:'Marcellus';font-weight:400;font-display:swap;src:url('/fonts/marcellus-400.woff2') format('woff2')}
@font-face{font-family:'Cinzel';font-weight:600;font-display:swap;src:url('/fonts/cinzel-600.woff2') format('woff2')}
:root{--plum:#413645;--plum-soft:#6e6172;--rose:#a85a76;--rose-deep:#8a4560;--cream:#f4efea;--line:#e6ddec;--white:#fffdfb;--muted:#8a7f86;--ok:#1d6b3a;--ok-bg:#dff3e6;--warn:#7a5200;--warn-bg:#fff1d6;--bad:#8c2f2f;--bad-bg:#f6e3e3}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font:15px/1.5 'Inter',system-ui,-apple-system,sans-serif;color:var(--plum);min-height:100vh;background:radial-gradient(38% 38% at 14% 18%,#f3c9d3 0%,transparent 60%),radial-gradient(42% 42% at 86% 12%,#cfc6ee 0%,transparent 60%),radial-gradient(46% 46% at 82% 88%,#c2ddcf 0%,transparent 62%),radial-gradient(42% 42% at 16% 92%,#c4d8f0 0%,transparent 60%),var(--cream);background-attachment:fixed}
.wrap{max-width:920px;margin:0 auto;padding:22px clamp(14px,4vw,28px) 90px;overflow-x:clip}
a{color:var(--rose-deep)}
:focus-visible{outline:2px solid var(--rose);outline-offset:2px}
h1,h3{font-family:'Marcellus','Cinzel',Georgia,serif;font-weight:400}
.top{display:flex;flex-direction:column;gap:10px;margin:0 0 16px}
.backlink{align-self:flex-start;color:var(--plum-soft);font-size:13px;text-decoration:none;min-height:32px;display:inline-flex;align-items:center}
.backlink:hover{color:var(--rose)}
h1{font-size:30px;line-height:1.15;margin:0;color:var(--plum)}
.chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.chip{display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:0 12px;border-radius:100px;font-size:12.5px;font-weight:600;background:rgba(255,255,255,.7);border:1px solid var(--line);color:var(--plum-soft)}
.chip i{width:8px;height:8px;border-radius:50%;background:#bbb}
.chip.on{color:var(--ok);background:var(--ok-bg);border-color:#bfe6cf}.chip.on i{background:var(--ok)}
.chip.off{color:var(--bad);background:var(--bad-bg);border-color:#ecc9c9}.chip.off i{background:var(--bad)}
.chip.warn{color:var(--warn);background:var(--warn-bg);border-color:#f0d69a}.chip.warn i{background:var(--warn)}
.sub{color:var(--plum-soft);font-size:12.5px;margin:0}
.muted{color:var(--muted);font-size:12px}
.cap{max-width:380px}

/* buttons: one language everywhere. 44px targets, pill shape, rose/plum primaries */
.btn,button.btn,a.btn{font:inherit;font-weight:600;font-size:14px;letter-spacing:.01em;min-height:44px;padding:0 20px;border-radius:100px;border:1px solid var(--line);background:var(--white);color:var(--plum);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;box-shadow:0 1px 3px rgba(65,54,69,.06);transition:background .15s,border-color .15s,transform .1s,box-shadow .15s;-webkit-tap-highlight-color:transparent}
.btn:hover{background:#f8f4fb;border-color:#d9cce3}
.btn:active{transform:scale(.97)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn.sm{min-height:40px;padding:0 14px;font-size:13px}
.btn.primary{background:var(--plum);border-color:var(--plum);color:#fff;box-shadow:0 6px 16px rgba(65,54,69,.22)}
.btn.primary:hover{background:#54465a}
.btn.primary.rose{background:var(--rose);border-color:var(--rose);box-shadow:0 6px 16px rgba(168,90,118,.3)}
.btn.primary.rose:hover{background:var(--rose-deep)}
.btn.quiet{background:transparent;border-color:transparent;color:var(--plum-soft);box-shadow:none}
.btn.quiet:hover{background:rgba(255,255,255,.7)}
.btn.copied{background:var(--ok-bg)!important;color:var(--ok)!important;border-color:#bfe6cf!important}
.btn.loading{position:relative;color:transparent!important;pointer-events:none}
.btn.loading::after{content:"";position:absolute;inset:0;margin:auto;width:16px;height:16px;border:2px solid var(--plum);border-right-color:transparent;border-radius:50%;animation:spin .6s linear infinite}
.btn.primary.loading::after{border-color:#fff;border-right-color:transparent}
@keyframes spin{to{transform:rotate(360deg)}}

.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 14px}
details.moretools{position:relative}
details.moretools>summary{list-style:none}
details.moretools>summary::-webkit-details-marker{display:none}
.morepanel{margin-top:10px;background:rgba(255,253,251,.92);backdrop-filter:blur(14px);border:1px solid var(--line);border-radius:18px;padding:8px;box-shadow:0 14px 40px rgba(65,54,69,.16);display:grid;gap:2px;min-width:min(340px,calc(100vw - 28px))}
.morerow{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:1px;width:100%;background:none;border:none;border-radius:12px;padding:10px 14px;min-height:48px;font:inherit;color:var(--plum);cursor:pointer;text-decoration:none}
.morerow:hover{background:#f6f0f8}
.morerow b{font-size:14px}
.morerow span{font-size:12px;color:var(--muted)}
.morenote{padding:8px 14px;font-size:12px;color:var(--muted);border-top:1px solid var(--line);margin-top:4px}
@media (min-width:600px){details.moretools[open] .morepanel{position:absolute;z-index:30}}

/* tabs: one scrollable row, sticky so switching is always one tap away */
.tabsbar{position:sticky;top:0;z-index:20;margin:0 calc(-1 * clamp(14px,4vw,28px)) 14px;padding:8px clamp(14px,4vw,28px);background:linear-gradient(180deg,rgba(244,239,234,.94),rgba(244,239,234,.8));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.tabs::-webkit-scrollbar{display:none}
.tab{flex:0 0 auto;min-height:44px;padding:0 13px;border-radius:100px;border:1px solid var(--line);background:rgba(255,255,255,.75);font:inherit;font-size:13px;font-weight:600;color:var(--plum-soft);cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;transition:background .15s,color .15s}
.tab:hover{background:#fff}
.tab em{font-style:normal;font-size:12px;font-weight:600;min-width:22px;height:22px;padding:0 6px;border-radius:100px;background:rgba(65,54,69,.08);display:inline-flex;align-items:center;justify-content:center}
.tab.active{background:var(--plum);color:#fff;border-color:var(--plum)}
.tab.active em{background:rgba(255,255,255,.2)}
.tab.attn:not(.active){background:var(--bad-bg);color:var(--bad);border-color:#ecc9c9}

.pill{display:inline-block;padding:2px 11px;border-radius:100px;font-size:12px;font-weight:600;white-space:nowrap}
.st-ready{background:var(--ok-bg);color:var(--ok)}.st-draft{background:#eee;color:#666}.st-paused{background:var(--warn-bg);color:var(--warn)}.st-overdue{background:var(--bad-bg);color:var(--bad)}
.emptystate{background:rgba(255,255,255,.6);border:1px dashed #d9cce3;border-radius:20px;padding:44px 24px;text-align:center;color:var(--muted)}
.emptystate[hidden]{display:none}
.emptyicon{font-size:34px;margin-bottom:8px}
.emptystate h3{color:var(--plum);margin:0 0 8px;font-size:20px}
.emptystate p{margin:0 auto;font-size:14px;max-width:420px}
.emptystate a{color:var(--rose);font-weight:600;text-decoration:none}
.tabempty{margin:10px 0}

.pgrid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.pcard{display:flex;gap:14px;background:rgba(255,255,255,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.8);border-radius:20px;padding:14px;box-shadow:0 8px 26px rgba(65,54,69,.07);min-width:0;transition:opacity .25s,transform .25s,box-shadow .15s}
.pcard:hover{box-shadow:0 12px 32px rgba(65,54,69,.11)}
.pcard.filtered-out{display:none}
.pcard.leaving{opacity:.35;transform:scale(.99);pointer-events:none}
.pcard[data-cat="attention"]{border-color:#e9b9b9;background:rgba(255,247,246,.8)}
.pcard[data-cat="needs"]{border-color:#f0d69a;background:rgba(255,249,235,.78)}
.pthumb{width:84px;height:84px;flex-shrink:0;border-radius:14px;overflow:hidden;background:#efe8f2;display:block}
.pthumb img,.pthumb video{width:100%;height:100%;object-fit:cover;display:block}
.pthumb-empty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:26px}
.pbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.prow1{display:flex;justify-content:space-between;align-items:center;gap:8px}
.prow1 b{font-size:15px}
.ptype{text-transform:capitalize;font-size:12.5px;color:var(--muted)}
.campaign{color:var(--rose);font-weight:600;text-transform:none}
.pcap{font-size:13.5px;color:var(--plum);overflow-wrap:anywhere}
.pcap-full{white-space:pre-wrap;line-height:1.55;background:rgba(255,255,255,.65);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:2px 0}
.more{color:var(--rose-deep);font-weight:600;cursor:pointer}
.pactions{margin-top:6px;display:flex;flex-wrap:wrap;gap:8px}
.pplatforms{margin-top:6px;display:flex;flex-direction:column;gap:8px}
.platrow{font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.platchip{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:6px;color:#fff;letter-spacing:.02em}
.pc-instagram{background:linear-gradient(45deg,#f09433,#dc2743,#bc1888)}
.pc-facebook{background:#1877f2}
.s{font-size:11.5px;font-weight:600;padding:2px 10px;border-radius:100px;background:#eee}
.s-published{background:var(--ok-bg);color:var(--ok)}.s-failed,.s-missed{background:var(--bad-bg);color:var(--bad)}.s-processing{background:var(--warn-bg);color:var(--warn)}
.err{color:var(--bad);font-size:12.5px;flex-basis:100%;background:rgba(246,227,227,.6);border-radius:10px;padding:8px 10px}
.warn{background:var(--warn-bg);border-radius:16px;padding:14px 18px;margin:0 0 16px;font-size:14px}
.manual{color:var(--warn);font-size:13px;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.manual.posted{color:var(--ok)}
.manual.posted a{color:var(--ok);font-weight:600}
.stats{font-size:12px;color:#5a3f4e;flex-basis:100%}
.nolink{color:var(--bad);font-weight:600;font-size:12.5px}
.commentlist{margin-top:4px;padding-left:10px;border-left:2px solid var(--line);flex-basis:100%}
.commentrow{font-size:12px;color:#5a3f4e;line-height:1.5}
.commentrow b{color:var(--plum)}

/* results panel (connection check / dry run) */
.outbox{background:rgba(255,255,255,.88);border:1px solid var(--line);border-radius:20px;padding:16px 18px;margin:0 0 14px;box-shadow:0 8px 26px rgba(65,54,69,.07);position:relative}
.outbox[hidden]{display:none}
.outclose{position:absolute;top:8px;right:8px;width:44px;height:44px;border:none;background:none;font-size:16px;color:var(--muted);cursor:pointer;border-radius:100px}
.outclose:hover{background:#f6f0f8}
.checkhead{font-weight:600;margin:0 40px 10px 0}
.checkrow{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.checkrow:last-child{border-bottom:none}
.checkrow.bad b{color:var(--bad)}

/* sheet (replaces confirm/prompt) + toasts */
.sheetbg{position:fixed;inset:0;background:rgba(40,32,42,.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;z-index:60;animation:fade .15s}
.sheetbg[hidden]{display:none}
.sheet{background:var(--white);border-radius:24px;width:min(440px,100%);padding:24px 22px 20px;box-shadow:0 24px 70px rgba(40,32,42,.4);animation:rise .2s ease-out}
.sheet h3{margin:0 0 8px;font-size:22px;color:var(--plum)}
.sheet p{margin:0 0 14px;font-size:14px;color:var(--plum-soft)}
.sheet input{width:100%;min-height:48px;padding:0 14px;border:1px solid var(--line);border-radius:14px;font:inherit;font-size:15px;color:var(--plum);background:#fff;margin:0 0 6px}
.sheet input[hidden]{display:none}
.sheet .hint{font-size:12px;color:var(--muted);margin:0 0 14px}
.sheetbtns{display:flex;gap:10px;justify-content:flex-end;margin-top:6px}
.sheetbtns .btn{flex:1}
.btn.danger{background:var(--bad);border-color:var(--bad);color:#fff}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
#toasts{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;display:flex;flex-direction:column;gap:8px;align-items:center;width:min(560px,calc(100vw - 24px));pointer-events:none}
.toast{pointer-events:auto;display:flex;align-items:center;gap:12px;padding:10px 10px 10px 18px;border-radius:100px;background:rgba(65,54,69,.96);color:#fff;font-size:14px;box-shadow:0 12px 34px rgba(40,32,42,.35);animation:rise .2s ease-out;max-width:100%}
.toast.err{background:#7a2b2b}
.toast.ok{background:#245c3a}
.toast span{flex:1;min-width:0}
.toast button{font:inherit;font-weight:700;font-size:13px;color:#f3c9d3;background:rgba(255,255,255,.14);border:none;min-height:36px;padding:0 16px;border-radius:100px;cursor:pointer}
.toast button:hover{background:rgba(255,255,255,.24)}
.toast .spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}

/* preview modal */
.modalbg{position:fixed;inset:0;background:rgba(40,32,42,.55);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;z-index:50}
.modalbg[hidden]{display:none}
.modalbox{background:#fff;border-radius:24px;max-width:420px;width:100%;padding:18px;position:relative;box-shadow:0 20px 60px rgba(40,32,42,.35)}
.modalclose{position:absolute;top:6px;right:6px;border:none;background:#f1ebf3;color:var(--plum);width:44px;height:44px;border-radius:100px;cursor:pointer;font-size:16px;line-height:1;z-index:2}
.modaltabs{display:flex;gap:8px;margin:0 0 14px;padding-right:46px}
.modaltab{border:1px solid var(--line);background:#fff;color:var(--muted);min-height:40px;padding:0 16px;border-radius:100px;font-size:13px;font-weight:700;cursor:pointer}
.modaltab.active{background:var(--plum);color:#fff;border-color:var(--plum)}
.modalmeta{font-size:12px;color:var(--muted);margin:-8px 0 12px;text-align:center}
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

[hidden]{display:none!important}
.platrow.quietfail .err{background:transparent;color:var(--muted);padding:0 0 0 2px;font-size:12px}
.platrow.quietfail .s-failed,.platrow.quietfail .s-missed{background:#f1ecee;color:#8a6f76}
.pcard.flash{animation:flash 1.6s ease-out}
@keyframes flash{0%,40%{box-shadow:0 0 0 4px rgba(168,90,118,.55)}100%{box-shadow:0 8px 26px rgba(65,54,69,.07)}}

/* stats */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:10px;margin:0 0 10px}
.tile{background:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.85);border-radius:18px;padding:12px 14px;display:flex;flex-direction:column;gap:1px;box-shadow:0 6px 20px rgba(65,54,69,.06)}
.tile span{font-size:15px}
.tile b{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:24px;color:var(--plum);line-height:1.2}
.tile i{font-style:normal;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.statbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}
.statbar select{min-height:40px;border:1px solid var(--line);border-radius:100px;background:var(--white);padding:0 14px;font:inherit;font-size:13px;color:var(--plum)}
.statbar .btn{margin-left:auto}
.slist{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.srow{display:flex;gap:14px;background:rgba(255,255,255,.72);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.8);border-radius:20px;padding:14px;box-shadow:0 8px 26px rgba(65,54,69,.07)}
.sbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.mgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));gap:6px;margin:4px 0 2px}
.m{background:rgba(244,239,234,.7);border-radius:12px;padding:7px 10px}
.m span{display:block;font-size:11px;color:var(--muted)}
.m b{font-size:17px;color:var(--plum)}
.m.na b{color:#c3b9c0}
.growth{font-size:12.5px;font-weight:600;color:var(--ok)}
.sline{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:12px;color:var(--plum-soft)}
.sparkwrap{display:inline-flex;align-items:center;gap:6px;color:var(--rose)}
.sparkwrap i{font-style:normal;font-size:11px;color:var(--muted)}
.scomments{margin-top:2px;border-top:1px solid var(--line);padding-top:6px}
.scomments summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--rose-deep);min-height:36px;display:flex;align-items:center}
.scomments .commentrow{padding:5px 0;border-bottom:1px dashed var(--line);font-size:13px}
.scomments .commentrow:last-child{border-bottom:none}

/* calendar */
.cal-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.cal-head h3{margin:0 6px;font-size:22px;min-width:150px;text-align:center}
.cal-count{margin-left:auto}
.cal-dow,.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.cal-dow span{text-align:center;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:4px 0}
.cal-cell{font:inherit;color:var(--plum);text-align:left;min-height:92px;padding:6px;border-radius:14px;border:1px solid rgba(255,255,255,.85);background:rgba(255,255,255,.62);cursor:pointer;display:flex;flex-direction:column;gap:4px;min-width:0;transition:background .15s,border-color .15s}
.cal-cell.blank{background:transparent;border-color:transparent;cursor:default}
.cal-cell:not(.blank):hover{background:#fff}
.cal-cell.today .cal-n{background:var(--rose);color:#fff}
.cal-cell.sel{border-color:var(--rose);box-shadow:0 0 0 2px rgba(168,90,118,.25)}
.cal-n{font-size:12.5px;font-weight:600;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center}
.cal-pills{display:flex;flex-direction:column;gap:3px;min-width:0}
.cal-pill{font-style:normal;border-radius:8px;padding:2px 6px;font-size:11px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.cal-pill b{font-weight:600}
.cal-more{font-style:normal;font-size:11px;color:var(--muted);padding-left:4px}
.c-needs{background:#fdecc8;color:#7a5200}.c-scheduled{background:#ece3f4;color:#5a3f7a}.c-published{background:var(--ok-bg);color:var(--ok)}.c-draft{background:#eee;color:#666}.c-attention{background:var(--bad-bg);color:var(--bad)}
.cal-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:12px 2px;font-size:12px;color:var(--plum-soft)}
.cal-legend span{display:inline-flex;align-items:center;gap:6px}
.cal-dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.cal-dot.c-needs{background:#e2a93a}.cal-dot.c-scheduled{background:#8a63b3}.cal-dot.c-published{background:#2f9a58}.cal-dot.c-draft{background:#b5b0b3}.cal-dot.c-attention{background:#d24c4c}
.cal-agenda{background:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.85);border-radius:20px;padding:14px 16px;box-shadow:0 8px 26px rgba(65,54,69,.07)}
.cal-agenda h4{margin:0 0 8px;font-family:'Marcellus',Georgia,serif;font-weight:400;font-size:19px}
.cal-none{color:var(--muted);font-size:14px;padding:10px 0}
.cal-row{display:flex;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--line);flex-wrap:wrap}
.cal-row:first-of-type{border-top:none}
.cal-thumb{width:52px;height:52px;border-radius:12px;overflow:hidden;background:#efe8f2;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px}
.cal-thumb img{width:100%;height:100%;object-fit:cover}
.cal-info{flex:1;min-width:150px;font-size:13.5px}
.cal-cap{color:var(--plum-soft);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}
.cal-tag{display:inline-block;border-radius:100px;padding:1px 9px;font-size:11px;font-weight:600;margin-left:4px}
.cal-btns{display:flex;gap:8px}
@media (max-width:640px){
  .cal-cell{min-height:58px;padding:5px;align-items:center}
  .cal-pills{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:3px}
  .cal-pill{width:9px;height:9px;padding:0;border-radius:50%}
  .cal-pill b{display:none}
  .cal-pill.c-needs{background:#e2a93a}.cal-pill.c-scheduled{background:#8a63b3}.cal-pill.c-published{background:#2f9a58}.cal-pill.c-draft{background:#b5b0b3}.cal-pill.c-attention{background:#d24c4c}
  .cal-more{display:none}
  .cal-head h3{min-width:0;flex:1;font-size:19px}
  .cal-count{width:100%;margin:0}
  .cal-btns{width:100%}.cal-btns .btn{flex:1}
  .srow{flex-direction:column}
  .srow .pthumb{width:72px;height:72px}
}
@media (max-width:560px){
  .wrap{padding:14px 14px 90px}
  h1{font-size:26px}
  .actions .btn.primary{flex:1 1 100%}
  .actions .btn{flex:1}
  details.moretools{flex:1}
  details.moretools>summary{width:100%}
  .morepanel{min-width:0;width:100%}
  .pcard{display:grid;grid-template-columns:72px minmax(0,1fr);column-gap:12px;row-gap:6px;padding:12px}
  .pbody{display:contents}
  .pthumb{width:72px;height:72px;grid-row:1/3}
  .prow1,.ptype{grid-column:2}
  .pcap,.pactions,.pplatforms{grid-column:1/-1}
  .pactions .btn{flex:1 1 calc(50% - 8px)}
  .pactions .btn.primary{flex:1 1 100%}
  .sheetbg{align-items:flex-end;padding:0}
  .sheet{border-radius:24px 24px 0 0;width:100%;padding-bottom:calc(20px + env(safe-area-inset-bottom))}
  .modalbox{max-width:100%;padding:16px}
}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
</style></head><body><div class="wrap">
<header class="top">
  <a class="backlink" href="/admin">← Back to Admin</a>
  <h1>Social publisher</h1>
  <div class="chips" id="chips">
    <span class="chip ${d.enabled ? "on" : "off"}"><i></i>Auto-posting ${d.enabled ? "on" : "paused"}</span>
    <span class="chip ${d.pushEnabled ? "on" : "warn"}"><i></i>Phone alerts ${d.pushEnabled ? "on" : "off"}</span>
    <span class="chip"><i></i>Last check ${d.lastRun ? esc(timeAgo(d.lastRun.at) || "just now") + (d.lastRun.skipped ? " · " + esc(d.lastRun.skipped) : "") : "never"}</span>
  </div>
  <p class="sub">Checks every 10 minutes · times shown in Eastern</p>
</header>
<div class="actions">
  <button class="btn primary" data-act="run" title="Publish anything that's due right now">▶ Run now</button>
  <button class="btn" data-act="refresh-stats" title="Pull fresh likes, comments and reach, and look for manual post links">↻ Refresh stats</button>
  <details class="moretools" id="moreTools">
    <summary class="btn" aria-label="More tools">⋯ More</summary>
    <div class="morepanel">
      <button class="morerow" data-act="verify"><b>🔌 Check connection</b><span>Tests the Meta token and the Instagram/Facebook link</span></button>
      <button class="morerow" data-act="dry-run"><b>🧪 Dry run</b><span>Shows what would post right now, without posting</span></button>
      ${d.pushEnabled ? `<button class="morerow" data-act="test-push"><b>📲 Send test alert</b><span>Sends a notification to your phone</span></button>` : ""}
      ${d.calendarUrl ? `<a class="morerow" href="${esc(d.calendarUrl)}"><b>📅 Subscribe to the "needs posting" calendar</b><span>Add it once in your phone's Calendar app for native reminders</span></a>` : ""}
      <div class="morenote">${d.pushEnabled ? "" : "Phone alerts are off: add an NTFY_TOPIC env var and subscribe to it in the free ntfy app. "}${d.calendarUrl ? "" : "Calendar reminders aren't set up: add a CALENDAR_FEED_TOKEN env var. "}Tip: add this page to your home screen (Share → Add to Home Screen) for one-tap access.</div>
    </div>
  </details>
</div>
<div id="out" class="outbox" hidden></div>
${probs}
<div id="view">
${sorted.length ? `<nav class="tabsbar" aria-label="Post categories"><div class="tabs" role="tablist">
  ${tabDefs.map((t) => `<button class="tab${t.key === "attention" ? " attn" : ""}${t.key === defaultTab ? " active" : ""}" role="tab" aria-selected="${t.key === defaultTab}" data-filter="${t.key}">${t.label} ${t.key === "calendar" ? "" : `<em>${t.key === "all" ? sorted.length : t.key === "stats" ? statCount : (counts[t.key] || 0)}</em>`}</button>`).join("")}
</div></nav>
<div class="emptystate tabempty" id="tabEmpty" hidden><div class="emptyicon">🎉</div><h3>All clear</h3><p>Nothing in this tab right now.</p></div>` : ""}
${sorted.length ? `<div class="pgrid" id="grid">${cards}</div>` : empty}
${sorted.length ? `<section id="calView" hidden aria-label="Calendar"></section>${statsView(sorted, cfg)}` : ""}
</div>
<div id="previewModal" class="modalbg" hidden><div class="modalbox">
  <button class="modalclose" id="previewClose" aria-label="Close preview">✕</button>
  <div id="previewTabs"></div>
  <div id="previewMeta" class="modalmeta"></div>
  <div id="previewBody"></div>
</div></div>
<div id="sheet" class="sheetbg" hidden role="dialog" aria-modal="true" aria-labelledby="sheetTitle"><div class="sheet">
  <h3 id="sheetTitle"></h3>
  <p id="sheetBody"></p>
  <input id="sheetInput" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" hidden>
  <p class="hint" id="sheetHint" hidden></p>
  <div class="sheetbtns"><button class="btn" id="sheetCancel" type="button">Cancel</button><button class="btn primary" id="sheetOk" type="button">OK</button></div>
</div></div>
<div id="toasts" role="status" aria-live="polite"></div>
<script type="application/json" id="postsData">${previewData}</script>
<script>
(function(){
'use strict';
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function escHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function readPosts(){try{return JSON.parse($('#postsData').textContent);}catch(e){return [];}}
var POSTS=readPosts();
var busyCount=0, lastRefresh=Date.now();

// ---- toasts: every result is a plain sentence, never raw JSON ----
function toast(msg,o){
  o=o||{};
  var el=document.createElement('div'); el.className='toast'+(o.kind?' '+o.kind:'');
  if(o.busy){var sp=document.createElement('i');sp.className='spin';el.appendChild(sp);}
  var t=document.createElement('span'); t.textContent=msg; el.appendChild(t);
  var timer;
  function close(){clearTimeout(timer); if(el.parentNode)el.parentNode.removeChild(el);}
  if(o.action){var b=document.createElement('button');b.type='button';b.textContent=o.action.label;b.onclick=function(){close();o.action.fn();};el.appendChild(b);}
  var box=$('#toasts'); while(box.children.length>=3)box.removeChild(box.firstChild);
  box.appendChild(el);
  if(!o.busy)timer=setTimeout(close,o.ms||(o.action?8000:(o.kind==='err'?7000:4000)));
  return {close:close,update:function(m){t.textContent=m;}};
}

// ---- sheet: one in-page dialog instead of the browser's confirm()/prompt() ----
function ask(o){
  return new Promise(function(resolve){
    var bg=$('#sheet'),inp=$('#sheetInput'),hint=$('#sheetHint'),ok=$('#sheetOk'),cancel=$('#sheetCancel');
    $('#sheetTitle').textContent=o.title;
    var bo=$('#sheetBody'); bo.textContent=o.body||''; bo.hidden=!o.body;
    inp.hidden=!o.input; inp.value=''; inp.placeholder=o.placeholder||'';
    hint.hidden=!o.hint; hint.textContent=o.hint||'';
    ok.textContent=o.ok||'OK';
    ok.className='btn primary'+(o.rose?' rose':'')+(o.danger?' danger':'');
    var last=document.activeElement;
    function done(v){
      bg.hidden=true; document.removeEventListener('keydown',key,true);
      bg.onclick=null; ok.onclick=null; cancel.onclick=null;
      if(last&&last.focus){try{last.focus();}catch(e){}}
      resolve(v);
    }
    function key(e){
      if(e.key==='Escape'){e.preventDefault();done(null);return;}
      if(e.key==='Enter'&&document.activeElement===inp){e.preventDefault();ok.click();return;}
      if(e.key==='Tab'){
        var f=[inp,cancel,ok].filter(function(x){return !x.hidden;});
        var i=f.indexOf(document.activeElement);
        if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus();}
        else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus();}
      }
    }
    ok.onclick=function(){
      if(!o.input){done({value:''});return;}
      var v=inp.value.trim();
      if(o.required&&!v){inp.focus();return;}
      if(v&&!/^https?:[/][/]/i.test(v)){hint.hidden=false;hint.textContent="That doesn't look like a link. Paste the full https:// link.";inp.focus();return;}
      done({value:v});
    };
    cancel.onclick=function(){done(null);};
    bg.onclick=function(e){if(e.target===bg)done(null);};
    document.addEventListener('keydown',key,true);
    bg.hidden=false;
    setTimeout(function(){(o.input?inp:ok).focus();},30);
  });
}

// ---- talking to the server ----
async function api(body){
  var r;
  try{r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
  catch(e){throw new Error("Couldn't reach the server. Check your connection and try again.");}
  if(r.status===401)throw new Error('Your sign-in expired. Reload the page to sign in again.');
  var data; try{data=await r.json();}catch(e){throw new Error('The server took too long to answer ('+r.status+'). If you were posting, check again in a minute before retrying.');}
  if(!r.ok)throw new Error((data&&data.error)||('Request failed ('+r.status+')'));
  return data;
}
async function busy(btn,fn){
  busyCount++;
  if(btn){btn.classList.add('loading');btn.disabled=true;}
  try{return await fn();}
  finally{busyCount--; if(btn&&btn.isConnected){btn.classList.remove('loading');btn.disabled=false;}}
}
function fail(e){toast(e&&e.message?e.message:String(e),{kind:'err'});}

// ---- refresh the lists in place (no page reload, scroll and tab stay put) ----
var current=null, firstLoad=true;
async function refreshView(){
  try{
    var r=await fetch(location.pathname+'?_='+Date.now(),{headers:{Accept:'text/html'},cache:'no-store'});
    if(!r.ok)return false;
    var doc=new DOMParser().parseFromString(await r.text(),'text/html');
    ['#chips','#view'].forEach(function(sel){var a=$(sel),b=$(sel,doc);if(a&&b)a.innerHTML=b.innerHTML;});
    var pd=$('#postsData',doc); if(pd){$('#postsData').textContent=pd.textContent;POSTS=readPosts();}
    applyTab(current);
    lastRefresh=Date.now();
    return true;
  }catch(e){return false;}
}
function cardCat(id){var c=$$('.pcard').filter(function(x){return x.dataset.id===id;})[0];return c?c.dataset.cat:null;}

// ---- tabs: each post lives in exactly one ----
var TAB_KEY='necSocialTab';
function applyTab(f){
  var cs=$$('[data-filter]'); if(!cs.length)return;
  if(firstLoad){
    firstLoad=false;
    var saved=null; try{saved=localStorage.getItem(TAB_KEY);}catch(e){}
    var hasAttn=cs.some(function(c){return c.dataset.filter==='attention';});
    f=hasAttn?'attention':(saved&&cs.some(function(c){return c.dataset.filter===saved;})?saved:null);
  }
  if(!f||!cs.some(function(c){return c.dataset.filter===f;})){var a=cs.filter(function(c){return c.classList.contains('active');})[0];f=(a||cs[0]).dataset.filter;}
  current=f;
  cs.forEach(function(c){var on=c.dataset.filter===f;c.classList.toggle('active',on);c.setAttribute('aria-selected',on?'true':'false');});
  var act=cs.filter(function(c){return c.dataset.filter===f;})[0], strip=act&&act.parentNode;
  if(strip)strip.scrollLeft=Math.max(0,act.offsetLeft-(strip.clientWidth-act.offsetWidth)/2);
  var special=f==='calendar'||f==='stats';
  var cards=$$('.pcard'),shown=0;
  cards.forEach(function(card){var show=!special&&(f==='all'||card.dataset.cat===f);card.classList.toggle('filtered-out',!show);if(show)shown++;});
  var grid=$('.pgrid');
  if(grid){grid.hidden=special;
    // Published reads newest-first; everything else soonest-first.
    cards.slice().sort(function(a,b){return f==='published'?b.dataset.ts-a.dataset.ts:a.dataset.ts-b.dataset.ts;}).forEach(function(c){grid.appendChild(c);});}
  var cv=$('#calView'),sv=$('#statsView');
  if(cv)cv.hidden=f!=='calendar';
  if(sv)sv.hidden=f!=='stats';
  if(f==='calendar')renderCalendar();
  if(f==='stats')sortStats(statSortVal);
  var empty=$('#tabEmpty'); if(empty)empty.hidden=special||shown>0;
  try{localStorage.setItem(TAB_KEY,f);}catch(e){}
}

// ---- calendar (month grid, Eastern time) ----
var CAT_LABEL={attention:'Needs attention',needs:'Needs posting',scheduled:'Scheduled',draft:'Draft',published:'Published'};
var TYPE_ICON={image:'🖼️',carousel:'🔲',reel:'🎬',story:'📖'};
var etDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'});
var etTime=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
var calYM=null, calSel=null;
function dayKey(ms){return etDay.format(new Date(ms));}
function pad2(n){return (n<10?'0':'')+n;}
function timeShort(iso){return etTime.format(new Date(Date.parse(iso))).replace(':00','').replace(' AM','a').replace(' PM','p');}
function calByDay(){
  var by={};
  POSTS.forEach(function(p){var k=dayKey(Date.parse(p.publish_at));(by[k]=by[k]||[]).push(p);});
  Object.keys(by).forEach(function(k){by[k].sort(function(a,b){return Date.parse(a.publish_at)-Date.parse(b.publish_at);});});
  return by;
}
function renderCalendar(){
  var root=$('#calView'); if(!root)return;
  var today=dayKey(Date.now());
  if(!calYM){var t=today.split('-');calYM=[+t[0],+t[1]-1];}
  var y=calYM[0],m=calYM[1], by=calByDay();
  var lead=new Date(Date.UTC(y,m,1)).getUTCDay(), days=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  var title=new Date(Date.UTC(y,m,1)).toLocaleString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
  var prefix=y+'-'+pad2(m+1)+'-';
  if(!calSel||calSel.indexOf(prefix)!==0){
    if(today.indexOf(prefix)===0)calSel=today;
    else{var firstWith=Object.keys(by).filter(function(k){return k.indexOf(prefix)===0;}).sort()[0];calSel=firstWith||prefix+'01';}
  }
  var cells='', total=0, i;
  for(i=0;i<lead;i++)cells+='<span class="cal-cell blank"></span>';
  for(var d=1;d<=days;d++){
    var key=prefix+pad2(d), list=by[key]||[]; total+=list.length;
    var pills=list.slice(0,3).map(function(p){return '<i class="cal-pill c-'+p.cat+'"><b>'+TYPE_ICON[p.type]+' '+timeShort(p.publish_at)+'</b></i>';}).join('')+(list.length>3?'<i class="cal-more">+'+(list.length-3)+'</i>':'');
    cells+='<button type="button" class="cal-cell'+(key===today?' today':'')+(key===calSel?' sel':'')+(list.length?' has':'')+'" data-calday="'+key+'" aria-label="'+title.split(' ')[0]+' '+d+', '+list.length+' post'+(list.length===1?'':'s')+'"><span class="cal-n">'+d+'</span><span class="cal-pills">'+pills+'</span></button>';
  }
  var dow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(x){return '<span>'+x+'</span>';}).join('');
  var legend=['needs','scheduled','published','draft','attention'].map(function(c){return '<span><i class="cal-dot c-'+c+'"></i>'+CAT_LABEL[c]+'</span>';}).join('');
  var selList=by[calSel]||[];
  var selDate=new Date(calSel+'T12:00:00Z').toLocaleString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'});
  var agenda=selList.length?selList.map(function(p){
    var m0=p.media[0], thumb=m0&&!isVid(m0)?'<img src="'+escHtml(m0)+'" alt="">':'<span>'+(TYPE_ICON[p.type]||'')+'</span>';
    return '<div class="cal-row"><div class="cal-thumb">'+thumb+'</div><div class="cal-info"><div><b>'+etTime.format(new Date(Date.parse(p.publish_at)))+'</b> · '+(TYPE_ICON[p.type]||'')+' '+escHtml(p.type)+' <span class="cal-tag c-'+p.cat+'">'+CAT_LABEL[p.cat]+'</span></div><div class="cal-cap">'+escHtml((p.caption||'').slice(0,100))+'</div></div><div class="cal-btns"><button type="button" class="btn sm" data-preview="'+escHtml(p.id)+'">👁 Preview</button><button type="button" class="btn sm" data-jump="'+escHtml(p.id)+'" data-cat="'+p.cat+'">Open card</button>'+(p.cat==='published'?'<a class="btn sm" href="/admin?repost='+encodeURIComponent(p.id)+'">🔁 Schedule again</a>':'')+'</div></div>';
  }).join(''):'<div class="cal-none">Nothing scheduled this day.</div>';
  root.innerHTML='<div class="cal-head"><button type="button" class="btn sm" data-calnav="-1" aria-label="Previous month">‹</button><h3>'+title+'</h3><button type="button" class="btn sm" data-calnav="1" aria-label="Next month">›</button><button type="button" class="btn sm quiet" data-calnav="today">Today</button><span class="muted cal-count">'+total+' post'+(total===1?'':'s')+' this month</span></div>'
    +'<div class="cal-dow">'+dow+'</div><div class="cal-grid">'+cells+'</div><div class="cal-legend">'+legend+'</div>'
    +'<div class="cal-agenda"><h4>'+selDate+'</h4>'+agenda+'</div>';
}
function calNav(v){
  if(!calYM)renderCalendar();
  if(v==='today'){calYM=null;calSel=null;}
  else{var n=calYM[1]+(+v);calYM=[calYM[0]+Math.floor(n/12),((n%12)+12)%12];calSel=null;}
  renderCalendar();
}
function jumpToCard(id,cat){
  applyTab(cat);
  var card=$$('.pcard').filter(function(c){return c.dataset.id===id;})[0];
  if(!card)return;
  card.scrollIntoView({block:'center',behavior:'smooth'});
  card.classList.add('flash'); setTimeout(function(){card.classList.remove('flash');},1800);
}

// ---- stats ordering ----
var statSortVal='ts';
function sortStats(key){
  statSortVal=key||'ts';
  var list=$('.slist'); if(!list)return;
  $$('.srow',list).sort(function(a,b){return (b.dataset[statSortVal]-a.dataset[statSortVal]);}).forEach(function(r){list.appendChild(r);});
  var sel=$('#statSort'); if(sel&&sel.value!==statSortVal)sel.value=statSortVal;
}
document.addEventListener('change',function(e){if(e.target&&e.target.id==='statSort')sortStats(e.target.value);});

// ---- results panel (connection check / dry run) ----
function showOut(html){
  var out=$('#out');
  out.innerHTML='<button class="outclose" data-outclose aria-label="Close">✕</button>'+html;
  out.hidden=false;
  try{out.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(e){}
}
function plural(n,w){return n+' '+w+(n===1?'':'s');}

var ACTIONS={
  run:async function(btn){
    var r=await busy(btn,function(){return api({action:'run'});});
    if(r.skipped){toast("Didn't run: "+r.skipped);return;}
    var pub=(r.acted||[]).filter(function(a){return a.status==='published';}).length;
    var wait=(r.waiting||[]).length;
    toast((pub?'Published '+plural(pub,'post'):'Nothing was due right now')+(wait?' · '+wait+' still processing':''),{kind:pub?'ok':''});
    await refreshView();
  },
  'refresh-stats':async function(btn){
    var one=btn&&btn.dataset?btn.dataset.id:'';
    var r=await busy(btn,function(){return api({action:'refresh-stats',id:one||undefined});});
    var res=r.results||[]; var okN=res.filter(function(x){return x.ok;}).length, bad=res.length-okN;
    var links=r.manualLinks&&r.manualLinks.matched?r.manualLinks.matched.length:0;
    var parts=[okN?(one?'Updated this post':'Updated '+plural(okN,'post')):'No stats to update'];
    if(links)parts.push('found '+plural(links,'manual link'));
    if(bad)parts.push(bad+" couldn't update");
    toast(parts.join(' · '),{kind:bad?'':'ok'});
    await refreshView();
  },
  verify:async function(btn){
    var d=await busy(btn,function(){return api({action:'verify'});});
    if(Array.isArray(d.checks)){
      var allOk=d.checks.every(function(c){return c.ok;});
      showOut('<div class="checkhead">'+(allOk?'✅ Everything is connected':'⚠️ Something needs a look')+' <span class="muted">(v'+escHtml(d.version||'')+' · auto-posting '+(d.enabled?'on':'paused')+')</span></div>'
        +d.checks.map(function(c){return '<div class="checkrow '+(c.ok?'ok':'bad')+'">'+(c.ok?'✅':'❌')+' <div><b>'+escHtml(c.name)+'</b> <span class="muted">'+escHtml(c.detail||'')+'</span></div></div>';}).join(''));
    } else toast('Check finished, but the answer was unexpected.',{kind:'err'});
  },
  'dry-run':async function(btn){
    var r=await busy(btn,function(){return api({action:'dry-run'});});
    var rows=(r.acted||[]).map(function(a){return '<div class="checkrow ok">▶ <div><b>'+escHtml(a.id)+'</b> <span class="muted">'+escHtml(a.platform||'')+' · would '+escHtml(a.would||'publish')+'</span></div></div>';}).join('');
    var probs=(r.problems||[]).map(function(p){return '<div class="checkrow bad">❌ <div><b>'+escHtml(p.id)+'</b> <span class="muted">'+escHtml((p.errors||[]).join('; '))+'</span></div></div>';}).join('');
    showOut('<div class="checkhead">🧪 Dry run <span class="muted">· nothing was posted</span></div>'+(rows||'<div class="checkrow">Nothing is due right now.</div>')+probs);
  },
  'test-push':async function(btn){
    await busy(btn,function(){return api({action:'test-push'});});
    toast('Test alert sent. Check your phone.',{kind:'ok'});
  }
};

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
$('#previewClose').onclick=function(){modal.hidden=true;};
modal.addEventListener('click',function(e){if(e.target===modal)modal.hidden=true;});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!modal.hidden)modal.hidden=true;});


// ---- copy caption ----
async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true;}catch(e){}
  try{var ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();var ok=document.execCommand('copy');document.body.removeChild(ta);return ok;}catch(e){return false;}
}

// ---- save video ----
// A plain <a download> is ignored for cross-origin files (Cloudinary) in Safari and some
// Chromium builds, so the video is fetched as a blob first.
//  * Phones/tablets (Safari, Chrome, Edge mobile): hand the file to the native share sheet,
//    which has a real "Save Video". Browsers only allow that right after a tap, so if the
//    download took long enough that the tap expired, the button becomes "Ready: tap to
//    save" and the second tap (file already cached) opens the sheet.
//  * Desktop (Edge, Chrome, Firefox, Safari): a normal same-origin blob download to the
//    Downloads folder; no share dialog.
var savedFiles=new Map();
var isTouchDevice=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Mac/i.test(navigator.platform));
async function saveVideo(b){
  var original=b.dataset.label||b.textContent; b.dataset.label=original;
  var url=b.dataset.savevideo, filename=b.dataset.savename||'video.mp4';
  var file=savedFiles.get(url);
  try{
    if(!file){
      b.textContent='Preparing…'; b.classList.add('loading');
      var res=await fetch(url);
      if(!res.ok)throw new Error('download failed');
      var blob=await res.blob();
      file=new File([blob],filename,{type:blob.type||'video/mp4'});
      savedFiles.set(url,file);
      b.classList.remove('loading');
    }
    if(isTouchDevice&&navigator.canShare&&navigator.canShare({files:[file]})){
      try{await navigator.share({files:[file],title:filename});b.textContent=original;}
      catch(err){b.textContent=err&&err.name==='AbortError'?original:'✅ Ready: tap to save';}
      return;
    }
    var objUrl=URL.createObjectURL(file);
    var a=document.createElement('a'); a.href=objUrl; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){URL.revokeObjectURL(objUrl);},10000);
    b.textContent=original;
    toast('Video saved to your Downloads.',{kind:'ok'});
  }catch(err){
    b.classList.remove('loading'); b.textContent=original;
    toast("Couldn't download it here, so it opened in a new tab. Press and hold it to save.",{kind:'err'});
    window.open(url,'_blank');
  }
}

// ---- per-post actions ----
async function retryPost(b){
  var id=b.dataset.retry;
  try{
    await busy(b,function(){return api({action:'retry',id:id,platform:b.dataset.platform});});
    await refreshView();
    if(cardCat(id)==='attention')toast('Still failing. The reason is on the card.',{kind:'err'});
    else toast('Posted. Retry worked.',{kind:'ok'});
  }catch(e){fail(e);}
}
async function dismissPost(b){
  var id=b.dataset.dismiss, platform=b.dataset.platform, undo=!!b.dataset.undo;
  try{
    await busy(b,function(){return api({action:'dismiss',id:id,platform:platform,undo:undo?true:undefined});});
    await refreshView();
    if(undo)toast('Back on your attention list.');
    else toast("Dismissed. It won't count as needing attention.",{action:{label:'Undo',fn:function(){api({action:'dismiss',id:id,platform:platform,undo:true}).then(refreshView).catch(fail);}}});
  }catch(e){fail(e);}
}
async function addLink(b){
  var id=b.dataset.addlink;
  var r=await ask({title:'Add the post link',body:'Paste the link from Instagram (••• → Copy link).',input:true,required:true,placeholder:'https://www.instagram.com/…',ok:'Save link',rose:true});
  if(!r)return;
  try{
    await busy(b,function(){return api({action:'mark-manual',id:id,permalink:r.value});});
    await refreshView();
    toast('Link saved. Tracking its stats now.',{kind:'ok'});
  }catch(e){fail(e);}
}
async function markManual(b){
  var id=b.dataset.markmanual;
  if(b.dataset.undo){
    try{
      await busy(b,function(){return api({action:'mark-manual',id:id,undo:true});});
      await refreshView();
      toast('Moved back to Needs posting.');
    }catch(e){fail(e);}
    return;
  }
  var r=await ask({title:'Mark as posted',body:'Paste the link if you have it (Instagram app: ••• → Copy link).',input:true,placeholder:'https://www.instagram.com/…  (optional)',hint:'No link? Leave it blank and I will find it on Instagram for you.',ok:'Mark posted',rose:true});
  if(!r)return;
  var card=b.closest('.pcard'); if(card)card.classList.add('leaving');
  try{
    var d=await busy(b,function(){return api({action:'mark-manual',id:id,permalink:r.value||undefined});});
    await refreshView();
    var msg=d&&d.linkFound?'Marked posted, and found the link.':(r.value?'Marked posted.':'Marked posted. Looking for the link on Instagram…');
    toast(msg,{kind:'ok',action:{label:'Undo',fn:function(){api({action:'mark-manual',id:id,undo:true}).then(refreshView).catch(fail);}}});
  }catch(e){if(card)card.classList.remove('leaving');fail(e);}
}
async function postNow(b){
  var id=b.dataset.postnow;
  var post=POSTS.filter(function(p){return p.id===id;})[0];
  var where=post?post.platforms.map(function(p){return p==='instagram'?'Instagram':'Facebook';}).join(' and '):'your accounts';
  var r=await ask({title:'Post this live right now?',body:'It goes out immediately on '+where+', whatever its scheduled time.',ok:'Post now'});
  if(!r)return;
  var wait=toast('Posting now. This can take up to a minute, so keep this page open.',{busy:true});
  try{
    var d=await busy(b,function(){return api({action:'run',id:id});});
    wait.close();
    await refreshView();
    var done=(d.acted||[]).filter(function(a){return a.id===id&&a.status==='published';})[0];
    if(done)toast('Published ✓',done.link?{kind:'ok',action:{label:'View',fn:function(){window.open(done.link,'_blank');}}}:{kind:'ok'});
    else if(cardCat(id)==='attention')toast("It didn't go through. The reason is on the card.",{kind:'err'});
    else toast('Started. It is still processing and will finish on its own.');
  }catch(e){wait.close();fail(e);await refreshView();}
}

// ---- one delegated click handler, so lists can be swapped in place ----
var SELECTOR='[data-act],[data-retry],[data-preview],[data-capexpand],[data-copycap],[data-savevideo],[data-filter],[data-dismiss],[data-addlink],[data-markmanual],[data-postnow],[data-outclose],[data-calday],[data-calnav],[data-jump]';
document.addEventListener('click',function(e){
  var more=$('#moreTools');
  var el=e.target.closest?e.target.closest(SELECTOR):null;
  if(more&&more.open&&!(e.target.closest&&e.target.closest('#moreTools'))&&!(el&&el.hasAttribute('data-act')))more.open=false;
  if(!el)return;
  if(el.hasAttribute('data-act')){
    if(more)more.open=false;
    var fn=ACTIONS[el.dataset.act]; if(fn)fn(el).catch(fail);
  }
  else if(el.hasAttribute('data-filter'))applyTab(el.dataset.filter);
  else if(el.hasAttribute('data-outclose'))$('#out').hidden=true;
  else if(el.hasAttribute('data-calday')){calSel=el.dataset.calday;renderCalendar();var ag=$('.cal-agenda');if(ag&&window.matchMedia('(max-width:640px)').matches)ag.scrollIntoView({block:'nearest',behavior:'smooth'});}
  else if(el.hasAttribute('data-calnav'))calNav(el.dataset.calnav);
  else if(el.hasAttribute('data-jump'))jumpToCard(el.dataset.jump,el.dataset.cat);
  else if(el.hasAttribute('data-preview'))openPreview(el.dataset.preview);
  else if(el.hasAttribute('data-capexpand')){var w=el.closest('.pcap');w.querySelector('.capshort').hidden=true;w.querySelector('.capfull').hidden=false;}
  else if(el.hasAttribute('data-copycap')){
    var post=POSTS.filter(function(p){return p.id===el.dataset.copycap;})[0]; if(!post)return;
    copyText(post.caption||'').then(function(ok){
      if(!ok){toast("Couldn't copy. Press and hold the caption to copy it by hand.",{kind:'err'});return;}
      var original=el.dataset.label||el.textContent; el.dataset.label=original;
      el.textContent='✓ Copied'; el.classList.add('copied');
      setTimeout(function(){el.textContent=original;el.classList.remove('copied');},1400);
    });
  }
  else if(el.hasAttribute('data-savevideo'))saveVideo(el);
  else if(el.hasAttribute('data-retry'))retryPost(el);
  else if(el.hasAttribute('data-dismiss'))dismissPost(el);
  else if(el.hasAttribute('data-addlink'))addLink(el);
  else if(el.hasAttribute('data-markmanual'))markManual(el);
  else if(el.hasAttribute('data-postnow'))postNow(el);
});

// ---- keep the page fresh when it's open (e.g. from the home screen) ----
function idle(){return busyCount===0&&$('#sheet').hidden&&modal.hidden;}
setInterval(function(){if(document.visibilityState==='visible'&&idle()&&Date.now()-lastRefresh>90000)refreshView();},30000);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&idle()&&Date.now()-lastRefresh>60000)refreshView();});

applyTab(null);
})();
</script></div></body></html>`;
}
