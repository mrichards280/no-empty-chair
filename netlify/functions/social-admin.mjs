// Status page + manual controls for the social publisher, at /admin/social.
// Behind the /admin Basic-Auth edge gate, and re-checks ADMIN_PASSWORD here (fails closed).
//   GET  /admin/social            status page
//   GET  /admin/social?format=json
//   POST /admin/social  {action: "verify" | "dry-run" | "run" | "retry" | "refresh-stats", id?, platform?}
import { getStore } from "@netlify/blobs";
import schedule from "../../public/social/schedule.json" with { type: "json" };
import { runTick, makeGraph, config as readConfig, validateSchedule, verifyConnection, mediaUrl, refreshAllStats } from "../lib/social-publisher.mjs";

export default async (req) => {
  const expected = Netlify.env.get("ADMIN_PASSWORD");
  if (!expected || !authorized(req.headers.get("authorization"), expected)) {
    return new Response("Authentication required.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="No Empty Chair Admin", charset="UTF-8"' } });
  }
  const cfg = readConfig();
  const store = getStore({ name: "social-publisher", consistency: "strong" });
  const graph = makeGraph(cfg);

  if (req.method === "POST") {
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
      return json({ ok: true, note: "cleared; it will publish on the next run if still within the late window" });
    }
    if (body.action === "refresh-stats") return json({ results: await refreshAllStats({ schedule, store, graph }) });
    return json({ error: "unknown action" }, 400);
  }

  const { posts, problems } = validateSchedule(schedule);
  const rows = await Promise.all(posts.map(async (p) => ({ ...p, state: (await store.get(p.id, { type: "json" })) || {} })));
  const lastRun = await store.get("_lastRun", { type: "json" });
  const data = { enabled: cfg.enabled, lastRun, problems, posts: rows };
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

function page(d, cfg) {
  const badge = (st, p, id) => {
    const s = st?.status || "scheduled";
    const link = st?.permalink ? ` <a href="${esc(st.permalink)}" target="_blank" rel="noopener">view ↗</a>` : "";
    const err = st?.error || st?.lastError ? `<div class="err">${esc(st.error || st.lastError)}</div>` : "";
    const retry = ["failed", "missed"].includes(s) ? ` <button class="mini" data-retry="${esc(id)}" data-platform="${p}">Retry</button>` : "";
    const stats = st?.stats;
    const statLine = stats
      ? `<div class="stats">${[
          stats.postedAt ? `posted ${esc(timeAgo(stats.postedAt))}` : null,
          num(stats.likes) !== null ? `❤️ ${num(stats.likes)}` : null,
          num(stats.comments) !== null ? `💬 ${num(stats.comments)}` : null,
          num(stats.reach) !== null ? `👁 ${num(stats.reach)} reach` : null,
          num(stats.plays) !== null ? `▶ ${num(stats.plays)} plays` : null,
          num(stats.saved) !== null ? `🔖 ${num(stats.saved)}` : null,
          num(stats.post_impressions) !== null ? `👁 ${num(stats.post_impressions)} impr.` : null,
          num(stats.post_engaged_users) !== null ? `⚡ ${num(stats.post_engaged_users)} engaged` : null,
        ].filter(Boolean).join(" · ")}<span class="muted"> (as of ${esc(timeAgo(stats.fetchedAt))})</span></div>`
      : "";
    return `<div class="platrow"><span class="platchip pc-${p}">${p === "instagram" ? "IG" : "FB"}</span> <span class="s s-${s}">${s}</span>${link}${retry}${err}${statLine}</div>`;
  };

  const sorted = d.posts.slice().sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));
  const cards = sorted.map((p) => {
    const media0 = p.media?.[0] || "";
    const isVid = /\.(mp4|mov)(\?|#|$)/i.test(media0);
    const src = media0 ? esc(mediaUrl(media0, cfg)) : "";
    const thumb = media0
      ? (isVid ? `<video src="${src}" muted></video>` : `<img src="${src}" alt="">`)
      : `<div class="pthumb-empty">${TYPE_ICON[p.type] || "🖼️"}</div>`;
    return `
    <div class="pcard">
      <a class="pthumb" href="${src || "#"}" target="_blank" rel="noopener">${thumb}</a>
      <div class="pbody">
        <div class="prow1">
          <b>${esc(fmt(p.publish_at))}</b>
          <span class="pill st-${esc(p.status || "draft")}">${esc(p.status || "draft")}</span>
        </div>
        <div class="ptype">${TYPE_ICON[p.type] || ""} ${esc(p.type)}${p.campaign ? ` <span class="campaign">🏷 ${esc(p.campaign)}</span>` : ""}</div>
        <div class="pcap">${esc((p.caption || "").slice(0, 100)) || `<span class="muted">no caption</span>`}</div>
        <div class="pplatforms">${p.manual_only ? `<div class="manual">🖐 Manual — needs stickers/polls/sound tag added in-app, post it yourself</div>` : p.platforms.map((pl) => badge(p.state[pl], pl, p.id)).join("")}</div>
      </div>
    </div>`;
  }).join("");

  const empty = `
    <div class="emptystate">
      <div class="emptyicon">📭</div>
      <h3>Nothing scheduled yet</h3>
      <p>Add your first post from the <a href="/admin">Social calendar</a> tab in Admin — once it's saved and marked "ready," it'll show up here.</p>
    </div>`;

  const probs = d.problems.length ? `<div class="warn"><b>Schedule problems (these posts will not go out):</b><ul>${d.problems.map((p) => `<li>${esc(p.id)}: ${esc(p.errors.join("; "))}</li>`).join("")}</ul></div>` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Social publisher</title>
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
button{font:inherit;font-weight:600;letter-spacing:.02em;font-size:13px;border:1px solid var(--line);background:#fff;color:var(--plum);padding:10px 18px;border-radius:100px;cursor:pointer;box-shadow:0 1px 3px rgba(65,54,69,.06)}
button:hover{background:#f8f4fb;border-color:#e2d6ea}
button.primary{background:var(--plum);color:#fff;border-color:var(--plum)}
button.primary:hover{background:#54465a}
.mini{padding:3px 10px;font-size:11px;box-shadow:none}
.pill{display:inline-block;padding:2px 11px;border-radius:100px;font-size:12px;font-weight:600}
.on{background:#dff3e6;color:#1d6b3a}.off{background:#f6e3e3;color:#8c2f2f}
.st-ready{background:#dff3e6;color:#1d6b3a}.st-draft{background:#eee;color:#666}.st-paused{background:#fff1d6;color:#7a5200}
.emptystate{background:rgba(255,255,255,.6);border:1px dashed #e2d6ea;border-radius:18px;padding:48px 24px;text-align:center;color:#8a7f86}
.emptyicon{font-size:36px;margin-bottom:10px}
.emptystate h3{font-family:'Cinzel',Georgia,serif;color:var(--plum);margin:0 0 8px;font-size:18px}
.emptystate p{margin:0;font-size:14px;max-width:420px;margin:0 auto}
.emptystate a{color:var(--rose);font-weight:600;text-decoration:none}
.emptystate a:hover{text-decoration:underline}
.pgrid{display:grid;gap:12px}
.pcard{display:flex;gap:14px;background:rgba(255,255,255,.7);border:1px solid var(--line);border-radius:16px;padding:14px;box-shadow:0 4px 14px rgba(65,54,69,.05)}
.pthumb{width:76px;height:76px;flex-shrink:0;border-radius:12px;overflow:hidden;background:#efe8f2;display:block}
.pthumb img,.pthumb video{width:100%;height:100%;object-fit:cover;display:block}
.pthumb-empty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:26px}
.pbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.prow1{display:flex;justify-content:space-between;align-items:center;gap:8px}
.ptype{text-transform:capitalize;font-size:12px;color:#8a7f86}
.campaign{color:var(--rose);font-weight:600;text-transform:none}
.pcap{font-size:13px;color:var(--plum)}
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
.stats{font-size:11px;color:#5a3f4e}
.outbox{background:rgba(255,255,255,.85);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-top:20px;box-shadow:0 4px 14px rgba(65,54,69,.05)}
.outbox pre{margin:0;font-size:12px;white-space:pre-wrap;overflow:auto;max-height:340px}
.checkhead{font-weight:600;margin-bottom:10px}
.checkrow{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}
.checkrow:last-child{border-bottom:none}
.checkrow.bad b{color:#8c2f2f}
</style></head><body><div class="wrap">
<a class="backlink" href="/admin">← Back to Admin</a>
<div class="pageheader">
  <h1>📅 Social publisher</h1>
  <p class="sub">Auto-posting is <span class="pill ${d.enabled ? "on" : "off"}">${d.enabled ? "ON" : "PAUSED"}</span>
  · checks every 10 minutes · last run ${d.lastRun ? esc(fmt(d.lastRun.at)) + (d.lastRun.skipped ? " (" + esc(d.lastRun.skipped) + ")" : "") : "never"} · times shown in Eastern</p>
</div>
<div class="actionbar">
  <button data-act="verify">🔌 Check connection</button>
  <button data-act="dry-run">🧪 Dry run</button>
  <button class="primary" data-act="run">▶ Run now</button>
  <button data-act="refresh-stats">↻ Refresh stats</button>
</div>
${probs}
${sorted.length ? `<div class="pgrid">${cards}</div>` : empty}
<div id="out" class="outbox" hidden></div>
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
 const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json();
 out.innerHTML=render(body.action,data);
 return data;}
document.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{await go({action:b.dataset.act});if(b.dataset.act==='refresh-stats')setTimeout(()=>location.reload(),600);});
document.querySelectorAll('[data-retry]').forEach(b=>b.onclick=async()=>{await go({action:'retry',id:b.dataset.retry,platform:b.dataset.platform});setTimeout(()=>location.reload(),600)});
</script></div></body></html>`;
}
