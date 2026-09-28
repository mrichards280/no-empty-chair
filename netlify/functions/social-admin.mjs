// Status page + manual controls for the social publisher, at /admin/social.
// Behind the /admin Basic-Auth edge gate, and re-checks ADMIN_PASSWORD here (fails closed).
//   GET  /admin/social            status page
//   GET  /admin/social?format=json
//   POST /admin/social  {action: "verify" | "dry-run" | "run" | "retry", id?, platform?}
import { getStore } from "@netlify/blobs";
import schedule from "../../social/schedule.json" with { type: "json" };
import { runTick, makeGraph, config as readConfig, validateSchedule, verifyConnection, mediaUrl } from "../lib/social-publisher.mjs";

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

function page(d, cfg) {
  const badge = (st, p, id) => {
    const s = st?.status || "scheduled";
    const link = st?.permalink ? ` <a href="${esc(st.permalink)}" target="_blank" rel="noopener">view</a>` : "";
    const err = st?.error || st?.lastError ? `<div class="err">${esc(st.error || st.lastError)}</div>` : "";
    const retry = ["failed", "missed"].includes(s) ? ` <button class="mini" data-retry="${esc(id)}" data-platform="${p}">Retry</button>` : "";
    return `<div><b>${p === "instagram" ? "IG" : "FB"}</b> <span class="s s-${s}">${s}</span>${link}${retry}${err}</div>`;
  };
  const rows = d.posts.slice().sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at)).map((p) => `
    <tr class="${esc(p.status || "draft")}">
      <td>${esc(fmt(p.publish_at))}</td>
      <td>${esc(p.type)}<div class="muted">${esc(p.status || "draft")}</div></td>
      <td><a href="${esc(mediaUrl(p.media[0] || "", cfg))}" target="_blank" rel="noopener">${esc(p.id)}</a><div class="muted cap">${esc((p.caption || "").slice(0, 90))}</div></td>
      <td>${p.platforms.map((pl) => badge(p.state[pl], pl, p.id)).join("")}</td>
    </tr>`).join("");
  const probs = d.problems.length ? `<div class="warn"><b>Schedule problems (these posts will not go out):</b><ul>${d.problems.map((p) => `<li>${esc(p.id)}: ${esc(p.errors.join("; "))}</li>`).join("")}</ul></div>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Social publisher</title>
<style>
:root{--plum:#413645;--rose:#a85a76;--cream:#faf6f2;--line:#e7dfe3}
body{margin:0;font:15px/1.45 system-ui,-apple-system,sans-serif;background:var(--cream);color:var(--plum)}
.wrap{max-width:1100px;margin:0 auto;padding:24px clamp(16px,4vw,32px)}
h1{font-size:22px;margin:0 0 4px}.muted{color:#8a7f86;font-size:12px}.cap{max-width:380px}
.bar{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
button{font:inherit;font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:12px;border:1px solid var(--plum);background:#fff;color:var(--plum);padding:8px 12px;border-radius:999px;cursor:pointer}
button.primary{background:var(--plum);color:#fff}.mini{padding:2px 8px;font-size:10px}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600}
.on{background:#dff3e6;color:#1d6b3a}.off{background:#f6e3e3;color:#8c2f2f}
.tablewrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px}
table{border-collapse:collapse;width:100%;min-width:640px}td,th{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a7f86}
tr.draft td,tr.paused td{opacity:.55}
.s{font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;background:#eee}
.s-published{background:#dff3e6;color:#1d6b3a}.s-failed,.s-missed{background:#f6e3e3;color:#8c2f2f}.s-processing{background:#fff1d6;color:#7a5200}
.err{color:#8c2f2f;font-size:12px;max-width:340px}.warn{background:#fff1d6;border-radius:12px;padding:10px 14px;margin:12px 0}
pre{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;overflow:auto;max-height:340px;font-size:12px;white-space:pre-wrap}
</style></head><body><div class="wrap">
<h1>Social publisher</h1>
<div>Auto-posting is <span class="pill ${d.enabled ? "on" : "off"}">${d.enabled ? "ON" : "PAUSED"}</span>
<span class="muted"> · checks every 10 minutes · last run ${d.lastRun ? esc(fmt(d.lastRun.at)) + (d.lastRun.skipped ? " (" + esc(d.lastRun.skipped) + ")" : "") : "never"} · times shown in Eastern</span></div>
<div class="bar"><button data-act="verify">Check connection</button><button data-act="dry-run">Dry run</button><button class="primary" data-act="run">Run now</button></div>
${probs}
<div class="tablewrap"><table><thead><tr><th>When</th><th>Type</th><th>Post</th><th>Status</th></tr></thead><tbody>${rows || `<tr><td colspan="4">No posts in social/schedule.json yet.</td></tr>`}</tbody></table></div>
<pre id="out" hidden></pre>
<script>
const out=document.getElementById('out');
async function go(body){out.hidden=false;out.textContent='Working...';
 const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 out.textContent=JSON.stringify(await r.json(),null,2);}
document.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>go({action:b.dataset.act}));
document.querySelectorAll('[data-retry]').forEach(b=>b.onclick=async()=>{await go({action:'retry',id:b.dataset.retry,platform:b.dataset.platform});setTimeout(()=>location.reload(),600)});
</script></div></body></html>`;
}
