// Social publisher core: reads public/social/schedule.json and publishes due posts to
// the No Empty Chair Instagram account and Facebook Page through Meta's Graph API.
//
// Used by:
//   netlify/functions/social-publisher.mjs  (scheduled, every 10 minutes)
//   netlify/functions/social-admin.mjs      (status page + manual actions at /admin/social)
//
// Env vars (Netlify > Site configuration > Environment variables):
//   SOCIAL_PUBLISHER_ENABLED  "true" to actually post. Anything else = paused.
//   META_PAGE_ID              Facebook Page ID
//   META_PAGE_TOKEN           long-lived Page access token (never-expiring type)
//   META_IG_USER_ID           Instagram professional account ID linked to the Page
//   META_GRAPH_VERSION        optional, default v25.0
//   SOCIAL_MAX_LATE_MINUTES   optional, default 360. A post that could not go out
//                             within this window is marked "missed", never posted late.
//   SOCIAL_NOTIFY_EMAIL       optional, default LEAD_TO_EMAIL or hello@noemptychair.co
//   RESEND_API_KEY            optional, reused from lead-notify for failure emails
//   SOCIAL_MEDIA_BASE         optional, default `${URL}/social/media`

// A post with manual_only: true is never auto-published, regardless of status
// or publish_at. It exists to hold a Story's caption/media as a reference while
// you add interactive elements (polls, stickers, quizzes, music) yourself in the
// Instagram/Facebook app — the Graph API cannot attach those, so any Story that
// needs them has to go out by hand.
export const TYPES = ["image", "carousel", "reel", "story"];
export const PLATFORMS = ["instagram", "facebook"];
const IMAGE_EXT = /\.(jpe?g)(\?|#|$)/i;
const ANY_IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov)(\?|#|$)/i;

// Safe in the browser too (no `process` global there) so the admin composer
// can import validatePost/validateSchedule directly instead of duplicating them.
const env = (k, d) => {
  const v = (globalThis.Netlify?.env?.get?.(k) ?? (typeof process !== "undefined" ? process.env[k] : undefined));
  return v === undefined || v === "" ? d : v;
};

export function config() {
  const site = env("URL", "https://noemptychair.co").replace(/\/$/, "");
  return {
    enabled: env("SOCIAL_PUBLISHER_ENABLED", "") === "true",
    pageId: env("META_PAGE_ID"),
    pageToken: env("META_PAGE_TOKEN"),
    igUserId: env("META_IG_USER_ID"),
    version: env("META_GRAPH_VERSION", "v25.0"),
    maxLateMin: Number(env("SOCIAL_MAX_LATE_MINUTES", "360")),
    notifyTo: env("SOCIAL_NOTIFY_EMAIL", env("LEAD_TO_EMAIL", "hello@noemptychair.co")),
    resendKey: env("RESEND_API_KEY"),
    mediaBase: env("SOCIAL_MEDIA_BASE", `${site}/social/media`).replace(/\/$/, ""),
  };
}

// ---------------------------------------------------------------- schedule

export function mediaUrl(m, cfg) {
  if (/^https?:\/\//i.test(m)) return m;
  return `${cfg.mediaBase}/${String(m).replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")}`;
}
const isVideo = (m) => VIDEO_EXT.test(m);

export function validatePost(p, cfg = config()) {
  const errs = [];
  if (!p || typeof p !== "object") return ["not an object"];
  if (!p.id || !/^[a-z0-9][a-z0-9._-]*$/i.test(p.id)) errs.push("id missing or has spaces/special characters");
  const t = Date.parse(p.publish_at);
  if (!p.publish_at || Number.isNaN(t)) errs.push("publish_at is not a valid date");
  else if (!/(Z|[+-]\d\d:?\d\d)$/.test(p.publish_at)) errs.push("publish_at needs a timezone offset, e.g. 2026-10-05T12:00:00-04:00");
  if (!TYPES.includes(p.type)) errs.push(`type must be one of ${TYPES.join(", ")}`);
  const plats = p.platforms || [];
  if (!plats.length || plats.some((x) => !PLATFORMS.includes(x))) errs.push("platforms must be instagram and/or facebook");
  const media = Array.isArray(p.media) ? p.media : [];
  if (!media.length) errs.push("media is empty");
  if (!["ready", "draft", "paused"].includes(p.status || "draft")) errs.push("status must be ready, draft, or paused");
  if (p.manual_only !== undefined && typeof p.manual_only !== "boolean") errs.push("manual_only must be true or false");
  if (p.campaign !== undefined && typeof p.campaign !== "string") errs.push("campaign must be text");

  const imgs = media.filter((m) => !isVideo(m));
  const vids = media.filter(isVideo);
  if (p.type === "image" && (media.length !== 1 || vids.length)) errs.push("image posts take exactly 1 image");
  if (p.type === "carousel" && (media.length < 2 || media.length > 10)) errs.push("carousels take 2 to 10 items");
  if (p.type === "carousel" && plats.includes("facebook") && vids.length) errs.push("Facebook multi-photo posts cannot include video; remove facebook or the video");
  if (p.type === "reel" && (media.length !== 1 || !vids.length)) errs.push("reels take exactly 1 video (.mp4 or .mov)");
  if (p.type === "story" && media.length !== 1) errs.push("stories take exactly 1 image or video");
  if (plats.includes("instagram")) {
    const badImg = imgs.filter((m) => !IMAGE_EXT.test(m));
    if (badImg.length) errs.push(`Instagram only accepts JPEG images: ${badImg.join(", ")} (npm run social:import converts PNG to JPEG)`);
    const cap = p.caption || "";
    if (cap.length > 2200) errs.push(`caption is ${cap.length} characters; Instagram max is 2200`);
    if ((cap.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) errs.push("more than 30 hashtags; Instagram rejects this");
  }
  for (const m of media) if (!isVideo(m) && !ANY_IMAGE_EXT.test(m)) errs.push(`unrecognized media type: ${m}`);
  return errs;
}

export function validateSchedule(schedule) {
  const posts = Array.isArray(schedule?.posts) ? schedule.posts : [];
  const problems = [];
  const seen = new Set();
  posts.forEach((p, i) => {
    const label = p?.id || `posts[${i}]`;
    if (p?.id && seen.has(p.id)) problems.push({ id: label, errors: ["duplicate id"] });
    seen.add(p?.id);
    const e = validatePost(p);
    if (e.length) problems.push({ id: label, errors: e });
  });
  return { posts, problems };
}

// ---------------------------------------------------------------- graph api

export class GraphError extends Error {
  constructor(msg, { status, code, subcode, transient, raw } = {}) {
    super(msg);
    Object.assign(this, { status, code, subcode, transient, raw });
  }
}
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 368, 613, 9004, 9007, 2207001, 2207003, 2207020, 2207032]);

export function makeGraph(cfg, fetchImpl = globalThis.fetch) {
  const base = `https://graph.facebook.com/${cfg.version}`;
  async function call(method, path, params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      qs.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    qs.append("access_token", cfg.pageToken);
    const url = method === "GET" ? `${base}/${path}?${qs}` : `${base}/${path}`;
    const res = await fetchImpl(url, method === "GET" ? { method } : {
      method, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs.toString(),
    });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || data.error) {
      const e = data.error || {};
      const code = e.code, sub = e.error_subcode;
      throw new GraphError(e.error_user_msg || e.message || `HTTP ${res.status}`, {
        status: res.status, code, subcode: sub, raw: e,
        transient: !!e.is_transient || res.status >= 500 || TRANSIENT_CODES.has(code) || TRANSIENT_CODES.has(sub),
      });
    }
    return data;
  }
  async function rupload(videoId, fileUrl) {
    const res = await fetchImpl(`https://rupload.facebook.com/video-upload/${cfg.version}/${videoId}`, {
      method: "POST", headers: { Authorization: `OAuth ${cfg.pageToken}`, file_url: fileUrl },
    });
    let data; try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || data.error || data.success === false) {
      const e = data.error || data.debug_info || {};
      throw new GraphError(e.message || `video upload failed (HTTP ${res.status})`, { status: res.status, transient: res.status >= 500, raw: data });
    }
    return data;
  }
  return {
    get: (p, q) => call("GET", p, q),
    post: (p, q) => call("POST", p, q),
    rupload,
  };
}

// ---------------------------------------------------------------- platform steps
// Each step moves one post forward on one platform and returns the new state.
// State is saved after every step, so a timeout or crash resumes cleanly on the next run.

const MAX_ATTEMPTS = 4;
const IG_PROCESSING_LIMIT_MS = 60 * 60 * 1000;

async function igStep(post, st, g, cfg) {
  const ig = cfg.igUserId;
  const media = post.media.map((m) => mediaUrl(m, cfg));
  const caption = post.caption || "";

  // Resume guard: a publish call was in flight when the last run ended.
  if (st.phase === "publishing") {
    const s = await g.get(st.container, { fields: "status_code" });
    if (s.status_code === "PUBLISHED") return { ...st, status: "published", phase: "done", note: "confirmed after resume" };
    st = { ...st, phase: "processing" };
  }

  if (!st.phase || st.phase === "new") {
    if (post.type === "carousel") {
      const children = [];
      for (const url of media) {
        const r = await g.post(`${ig}/media`, isVideo(url)
          ? { media_type: "VIDEO", video_url: url, is_carousel_item: true }
          : { image_url: url, is_carousel_item: true });
        children.push(r.id);
      }
      st = { ...st, status: "processing", phase: "children", children, startedAt: Date.now() };
    } else {
      const params =
        post.type === "reel" ? { media_type: "REELS", video_url: media[0], caption, share_to_feed: post.share_to_feed ?? true, cover_url: post.cover ? mediaUrl(post.cover, cfg) : undefined, thumb_offset: post.thumb_offset }
        : post.type === "story" ? (isVideo(media[0]) ? { media_type: "STORIES", video_url: media[0] } : { media_type: "STORIES", image_url: media[0] })
        : { image_url: media[0], caption };
      const r = await g.post(`${ig}/media`, params);
      st = { ...st, status: "processing", phase: "processing", container: r.id, startedAt: Date.now() };
    }
  }

  if (st.phase === "children") {
    const states = await Promise.all(st.children.map((id) => g.get(id, { fields: "status_code,status" })));
    const bad = states.find((s) => s.status_code === "ERROR" || s.status_code === "EXPIRED");
    if (bad) return { ...st, status: "failed", error: `carousel item failed: ${bad.status || bad.status_code}` };
    if (!states.every((s) => s.status_code === "FINISHED")) return tooSlow(st);
    const r = await g.post(`${ig}/media`, { media_type: "CAROUSEL", children: st.children.join(","), caption });
    st = { ...st, phase: "processing", container: r.id };
  }

  if (st.phase === "processing") {
    const s = await g.get(st.container, { fields: "status_code,status" });
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") return { ...st, status: "failed", error: `Instagram rejected the media: ${s.status || s.status_code}` };
    if (s.status_code === "PUBLISHED") return { ...st, status: "published", phase: "done" };
    if (s.status_code !== "FINISHED") return tooSlow(st);
    return { ...st, phase: "publishing", _publishNext: true };
  }
  return st;
}

async function igPublish(st, g, cfg) {
  const r = await g.post(`${cfg.igUserId}/media_publish`, { creation_id: st.container });
  let permalink;
  try { permalink = (await g.get(r.id, { fields: "permalink" })).permalink; } catch { /* nice to have */ }
  return { ...st, status: "published", phase: "done", mediaId: r.id, permalink };
}

function tooSlow(st) {
  if (Date.now() - (st.startedAt || Date.now()) > IG_PROCESSING_LIMIT_MS) return { ...st, status: "failed", error: "Instagram was still processing the media after 60 minutes" };
  return st; // still processing, check again next run
}

async function fbStep(post, st, g, cfg) {
  const page = cfg.pageId;
  const media = post.media.map((m) => mediaUrl(m, cfg));
  const message = post.caption_facebook ?? post.caption ?? "";

  // A single non-idempotent call was in flight when the last run died. Never guess: flag it.
  if (st.phase === "sending") return { ...st, status: "failed", error: "Last attempt was interrupted mid-send. Check the Page; if it did not post, press Retry." };

  if (post.type === "image") {
    await markSending(st);
    const r = await g.post(`${page}/photos`, { url: media[0], message, published: true });
    return { status: "published", phase: "done", postId: r.post_id || r.id };
  }

  if (post.type === "carousel") {
    const ids = [...(st.photoIds || [])];
    for (let i = ids.length; i < media.length; i++) {
      const r = await g.post(`${page}/photos`, { url: media[i], published: false });
      ids.push(r.id);
      st = { ...st, status: "processing", photoIds: ids };
      await st._save?.(st);
    }
    const params = { message };
    ids.forEach((id, i) => { params[`attached_media[${i}]`] = { media_fbid: id }; });
    await markSending(st);
    const r = await g.post(`${page}/feed`, params);
    return { status: "published", phase: "done", postId: r.id };
  }

  if (post.type === "story" && !isVideo(media[0])) {
    const photo = st.photoId || (await g.post(`${page}/photos`, { url: media[0], published: false })).id;
    await markSending({ ...st, photoId: photo });
    const r = await g.post(`${page}/photo_stories`, { photo_id: photo });
    return { status: "published", phase: "done", postId: r.post_id };
  }

  // Video: reel or video story. start -> hosted upload -> finish
  const edge = post.type === "reel" ? "video_reels" : "video_stories";
  let videoId = st.videoId;
  if (!videoId) {
    videoId = (await g.post(`${page}/${edge}`, { upload_phase: "start" })).video_id;
    st = { ...st, status: "processing", videoId };
    await st._save?.(st);
  }
  if (!st.uploaded) {
    await g.rupload(videoId, media[0]);
    st = { ...st, uploaded: true };
    await st._save?.(st);
  }
  await markSending(st);
  const finish = post.type === "reel"
    ? { video_id: videoId, upload_phase: "finish", video_state: "PUBLISHED", description: message }
    : { video_id: videoId, upload_phase: "finish" };
  const r = await g.post(`${page}/${edge}`, finish);
  return { status: "published", phase: "done", videoId, postId: r.post_id || videoId };

  async function markSending(s) { await s._save?.({ ...s, phase: "sending" }); }
}

// ---------------------------------------------------------------- the tick

const KEY = { ig: "instagram", fb: "facebook" };

export async function runTick({ schedule, store, now = Date.now(), graph, cfg = config(), dryRun = false, onlyId, budgetMs = 20000, notify = sendNotice } = {}) {
  const started = Date.now();
  const { posts, problems } = validateSchedule(schedule);
  const report = { at: new Date(now).toISOString(), enabled: cfg.enabled, dryRun, acted: [], waiting: [], problems, notices: [] };

  if (!dryRun) {
    if (!cfg.enabled) return { ...report, skipped: "paused (SOCIAL_PUBLISHER_ENABLED is not \"true\")" };
    const missing = ["pageId", "pageToken", "igUserId"].filter((k) => !cfg[k]);
    if (missing.length) return { ...report, skipped: `missing env: ${missing.join(", ")}` };
  }

  // Lock so a manual "Run now" and the schedule never double-publish.
  if (!dryRun) {
    const lock = await store.get("_lock", { type: "json" });
    if (lock && lock.until > Date.now()) return { ...report, skipped: "another run is in progress" };
    await store.setJSON("_lock", { until: Date.now() + 60000 });
  }

  try {
    const bad = new Set(problems.map((p) => p.id));
    for (const post of posts) {
      if (onlyId && post.id !== onlyId) continue;
      if (post.manual_only) { if (dryRun) report.waiting.push({ id: post.id, manual: true }); continue; }
      if ((post.status || "draft") !== "ready") continue;
      const at = Date.parse(post.publish_at);
      if (at > now) continue;
      const state = (await store.get(post.id, { type: "json" })) || {};

      for (const platform of post.platforms) {
        const st = state[platform] || {};
        if (st.status === "published" || st.status === "failed" || st.status === "missed") continue;

        if (bad.has(post.id)) {
          if (!dryRun) await save(post.id, platform, { status: "failed", error: "schedule entry is invalid: " + problems.find((p) => p.id === post.id).errors.join("; ") }, true);
          continue;
        }
        if (!st.phase && now - at > cfg.maxLateMin * 60000) {
          if (!dryRun) await save(post.id, platform, { status: "missed", error: `not started within ${cfg.maxLateMin} min of ${post.publish_at}` }, true);
          continue;
        }
        if (dryRun) { report.acted.push({ id: post.id, platform, would: st.phase ? `continue from ${st.phase}` : "start publishing" }); continue; }
        if (Date.now() - started > budgetMs) { report.waiting.push({ id: post.id, platform, reason: "time budget used, next run" }); continue; }

        let next = { ...st, _save: (s) => save(post.id, platform, s) };
        try {
          if (platform === "instagram") {
            next = await igStep(post, next, graph, cfg);
            if (next._publishNext) {
              delete next._publishNext;
              await save(post.id, platform, next); // phase=publishing persisted BEFORE the call
              next = await igPublish(next, graph, cfg);
            }
          } else {
            next = await fbStep(post, next, graph, cfg);
          }
          delete next._save;
          next.attempts = st.attempts || 0;
          await save(post.id, platform, next, next.status === "failed");
          (next.status === "published" ? report.acted : report.waiting).push({ id: post.id, platform, status: next.status, phase: next.phase, link: next.permalink });
        } catch (err) {
          const attempts = (st.attempts || 0) + 1;
          const give = !(err instanceof GraphError && err.transient) || attempts >= MAX_ATTEMPTS;
          const cur = (await store.get(post.id, { type: "json" }))?.[platform] || st;
          const failed = { ...cur, attempts, lastError: err.message, ...(give ? { status: "failed", error: err.message } : {}) };
          // Meta answered with an error, so the send definitely did not go through: safe to retry.
          // A network drop mid-send keeps phase "sending", which blocks an automatic retry.
          if (failed.phase === "sending" && err instanceof GraphError && err.status) failed.phase = "retry";
          await save(post.id, platform, failed, give);
          report.waiting.push({ id: post.id, platform, error: err.message, final: give });
        }
      }
    }
  } finally {
    if (!dryRun) await store.delete("_lock");
  }

  if (report.notices.length && !dryRun) await notify(report.notices, cfg).catch(() => {});
  return report;

  async function save(id, platform, st, noticeworthy = false) {
    const clean = { ...st }; delete clean._save; delete clean._publishNext;
    clean.updatedAt = new Date().toISOString();
    const cur = (await store.get(id, { type: "json" })) || {};
    cur[platform] = clean;
    await store.setJSON(id, cur);
    if (noticeworthy) report.notices.push({ id, platform, status: clean.status, error: clean.error });
  }
}

export async function sendNotice(notices, cfg) {
  if (!cfg.resendKey || !notices.length) return;
  const lines = notices.map((n) => `${n.id} (${n.platform}): ${n.status}${n.error ? " - " + n.error : ""}`);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "No Empty Chair Social <onboarding@resend.dev>",
      to: [cfg.notifyTo],
      subject: `Social publisher: ${notices.length} post${notices.length > 1 ? "s" : ""} need attention`,
      text: lines.join("\n") + "\n\nStatus page: https://noemptychair.co/admin/social",
    }),
  });
}

// ---------------------------------------------------------------- manual-post reminders

// Manual posts (Reels/Stories the API can't fully publish — polls, stickers, sound
// credits) never get touched by runTick. This is the parallel check: once a manual
// post's scheduled time arrives, email a one-time reminder (never repeats — tracked via
// state.manualReminder.sentAt) unless it's already been marked posted.
export async function checkManualReminders({ schedule, store, cfg = config(), now = Date.now() }) {
  if (!cfg.resendKey) return { sent: false, reason: "no RESEND_API_KEY" };
  const { posts } = validateSchedule(schedule);
  const due = [];
  for (const p of posts) {
    if (!p.manual_only || (p.status || "draft") !== "ready") continue;
    if (Date.parse(p.publish_at) > now) continue;
    const state = (await store.get(p.id, { type: "json" })) || {};
    if (state.manual?.status === "posted") continue;
    if (state.manualReminder?.sentAt) continue;
    due.push({ p, state });
  }
  if (!due.length) return { sent: false, reason: "nothing newly due" };

  const lines = due.map(({ p }) => `🖐🏾 ${p.type} — ${(p.caption || "").split("\n")[0].slice(0, 80) || "(no caption)"} — due ${p.publish_at}`);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "No Empty Chair Social <onboarding@resend.dev>",
      to: [cfg.notifyTo],
      subject: `🖐🏾 ${due.length} post${due.length > 1 ? "s" : ""} to post by hand today`,
      text: lines.join("\n") + "\n\nGrab the caption/media and mark it posted: https://noemptychair.co/admin/social",
    }),
  });
  for (const { p, state } of due) {
    await store.setJSON(p.id, { ...state, manualReminder: { sentAt: new Date(now).toISOString() } });
  }
  return { sent: true, ids: due.map(({ p }) => p.id) };
}

// ---------------------------------------------------------------- connection check

export async function verifyConnection(graph, cfg = config()) {
  const out = { version: cfg.version, enabled: cfg.enabled, checks: [] };
  const add = (name, ok, detail) => out.checks.push({ name, ok, detail });
  for (const k of ["pageId", "pageToken", "igUserId"]) add(`env ${k}`, !!cfg[k], cfg[k] ? "set" : "missing");
  if (!cfg.pageToken || !cfg.pageId) return out;
  try {
    const p = await graph.get(cfg.pageId, { fields: "name,instagram_business_account{id,username}" });
    add("Facebook Page", true, p.name);
    const linked = p.instagram_business_account;
    add("Instagram linked to Page", !!linked, linked ? `@${linked.username} (${linked.id})` : "no professional IG account linked");
    if (linked && cfg.igUserId && linked.id !== cfg.igUserId) add("META_IG_USER_ID matches", false, `env has ${cfg.igUserId}, Page is linked to ${linked.id}`);
  } catch (e) { add("Facebook Page", false, e.message); }
  if (cfg.igUserId) {
    try {
      const l = await graph.get(`${cfg.igUserId}/content_publishing_limit`, { fields: "quota_usage,config" });
      const d = l.data?.[0] || {};
      add("Instagram publishing quota", true, `${d.quota_usage ?? 0} of ${d.config?.quota_total ?? "?"} used in last 24h`);
    } catch (e) { add("Instagram publishing permission", false, e.message); }
  }
  return out;
}

// ---------------------------------------------------------------- performance tracking

// Likes/comments/permalink come from the stable media/post object fields.
// Reach/plays/saves/impressions come from the Insights edges, which are
// best-effort: accepted metric names vary by media type and get renamed or
// deprecated across API versions (Meta deprecated a batch of Page Insights
// metrics in mid-2026), and a Story's insights disappear once it expires
// after 24h. A failure there is recorded but never blocks the stable counts.
const IG_INSIGHT_METRICS = {
  IMAGE: "reach,saved",
  CAROUSEL_ALBUM: "reach,saved",
  VIDEO: "reach,saved,plays",
  REELS: "reach,saved,plays",
  STORY: "reach",
};

function readInsightRows(data) {
  const out = {};
  for (const row of data || []) out[row.name] = row.values?.[0]?.value ?? row.total_value?.value;
  return out;
}

// Pulls current performance numbers for one already-published post/platform.
// `st` is that platform's saved publish state (has mediaId for Instagram,
// postId for Facebook).
export async function fetchStats(graph, platform, st) {
  if (platform === "instagram" && st.mediaId) {
    const media = await graph.get(st.mediaId, { fields: "permalink,timestamp,media_product_type,like_count,comments_count" });
    const out = {
      permalink: media.permalink,
      postedAt: media.timestamp,
      likes: media.like_count,
      comments: media.comments_count,
      fetchedAt: new Date().toISOString(),
    };
    try {
      const metric = IG_INSIGHT_METRICS[media.media_product_type] || "reach";
      Object.assign(out, readInsightRows((await graph.get(`${st.mediaId}/insights`, { metric })).data));
    } catch (e) { out.insightsError = e.message; }
    return out;
  }
  if (platform === "facebook" && st.postId) {
    const post = await graph.get(st.postId, { fields: "permalink_url,created_time,likes.summary(true),comments.summary(true)" });
    const out = {
      permalink: post.permalink_url,
      postedAt: post.created_time,
      likes: post.likes?.summary?.total_count,
      comments: post.comments?.summary?.total_count,
      fetchedAt: new Date().toISOString(),
    };
    try {
      Object.assign(out, readInsightRows((await graph.get(`${st.postId}/insights`, { metric: "post_impressions,post_engaged_users" })).data));
    } catch (e) { out.insightsError = e.message; }
    return out;
  }
  return null;
}

// Walks every published post/platform in the schedule and refreshes its stats
// in the blob store in place. Returns a per-post/platform ok/error report.
export async function refreshAllStats({ schedule, store, graph }) {
  const { posts } = validateSchedule(schedule);
  const results = [];
  for (const post of posts) {
    const state = (await store.get(post.id, { type: "json" })) || {};
    let changed = false;
    for (const platform of post.platforms || []) {
      const st = state[platform];
      if (!st || st.status !== "published") continue;
      try {
        const stats = await fetchStats(graph, platform, st);
        if (stats) {
          state[platform] = { ...st, stats };
          changed = true;
          results.push({ id: post.id, platform, ok: true });
        }
      } catch (e) {
        results.push({ id: post.id, platform, ok: false, error: e.message });
      }
    }
    if (changed) await store.setJSON(post.id, state);
  }
  return results;
}
