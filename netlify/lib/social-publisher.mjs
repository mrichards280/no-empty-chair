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
    ntfyTopic: env("NTFY_TOPIC"),
    ntfyServer: env("NTFY_SERVER", "https://ntfy.sh"),
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
  if (p.first_comment !== undefined && typeof p.first_comment !== "string") errs.push("first_comment must be text");

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
  // Meta reports how much of its rate-limit budget this app has used on every response.
  const usage = { calls: 0, app: null, buc: null };
  const readHeader = (res, name) => { try { return JSON.parse(res.headers.get(name)); } catch { return null; } };
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
    usage.calls++;
    if (res.headers?.get) {
      usage.app = readHeader(res, "x-app-usage") || usage.app;
      usage.buc = readHeader(res, "x-business-use-case-usage") || usage.buc;
    }
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
    usage: () => usage,
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

// A first comment posted immediately reads as automated; staggering it randomly
// within this window (after the media is confirmed published) mimics when a
// real person would circle back and drop a follow-up comment.
const AUTO_COMMENT_MIN_MS = 10 * 60 * 1000;
const AUTO_COMMENT_MAX_MS = 40 * 60 * 1000;

async function igPublish(post, st, g, cfg) {
  const r = await g.post(`${cfg.igUserId}/media_publish`, { creation_id: st.container });
  let permalink;
  try { permalink = (await g.get(r.id, { fields: "permalink" })).permalink; } catch { /* nice to have */ }
  const next = { ...st, status: "published", phase: "done", mediaId: r.id, permalink };
  if (post.first_comment) {
    const delay = AUTO_COMMENT_MIN_MS + Math.random() * (AUTO_COMMENT_MAX_MS - AUTO_COMMENT_MIN_MS);
    next.autoComment = { message: post.first_comment, status: "pending", dueAt: Date.now() + delay };
  }
  return next;
}

// Posts each post's staggered first comment once its due time has passed.
// Runs alongside the main publish tick; failures are recorded but never retried
// automatically (a stale "first comment" posted hours late reads as spam).
export async function postAutoComments({ schedule, store, graph, cfg, now = Date.now() }) {
  const { posts } = validateSchedule(schedule);
  const posted = [];
  for (const post of posts) {
    const state = (await store.get(post.id, { type: "json" })) || {};
    const ig = state.instagram;
    if (!ig?.autoComment || ig.autoComment.status !== "pending") continue;
    if (now < ig.autoComment.dueAt) continue;
    try {
      const r = await graph.post(`${ig.mediaId}/comments`, { message: ig.autoComment.message });
      state.instagram = { ...ig, autoComment: { ...ig.autoComment, status: "posted", postedAt: new Date(now).toISOString(), commentId: r.id } };
      posted.push({ id: post.id, ok: true });
      await pushNotify(cfg, { title: "💬 First comment posted", message: `${post.type} · ${shortWhen(post.publish_at)}`, tags: ["speech_balloon"], priority: 2, click: ig.permalink });
    } catch (err) {
      state.instagram = { ...ig, autoComment: { ...ig.autoComment, status: "failed", error: err.message } };
      posted.push({ id: post.id, ok: false, error: err.message });
      await pushNotify(cfg, { title: "⚠️ First comment failed", message: `${post.type} · ${shortWhen(post.publish_at)}\n${String(err.message).slice(0, 150)}`, tags: ["warning"], priority: 4 });
    }
    await store.setJSON(post.id, state);
  }
  return { posted };
}

// ---------------------------------------------------------------- manual-post link finder

// Manual posts get published by hand in the Instagram app, so the system never sees the
// result. This closes that loop by looking for the post on Instagram and saving its real
// link (plus media id, so likes/comments can be tracked), marking it posted if you forgot.
//
// * Feed posts / reels / carousels: matched by caption against your 50 most recent media,
//   after stripping hashtags, emoji and punctuation, so a tweaked hashtag set still matches.
//   Media already tied to another post (e.g. an auto-published copy with the same caption)
//   is never reused.
// * Stories: Instagram hides story captions, so they're matched by posting time against
//   your live stories (the API only lists the last 24 hours): the nearest unclaimed story
//   within a window around the scheduled time wins.
//
// Search cadence for a post you've marked posted but that has no link yet: check at the
// next tick (check 1), 10 minutes later (check 2), then wait 30 minutes (check 3). If that
// third check still finds nothing it stops and sends a push, so you can paste the link.
// A post you haven't marked posted yet is searched every tick without counting failures,
// because it may simply not be posted yet. `force` (the Refresh button) ignores the
// schedule and never counts a failure.
const normCaption = (s) => String(s || "").toLowerCase().replace(/#[\p{L}\p{N}_]+/gu, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 60);
const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_CHECK_TOLERANCE_MS = 90 * 1000; // ticks drift a little; don't skip a check for being 20s early
const STORY_EARLY_MS = 3 * 60 * 60 * 1000;
const STORY_LATE_MS = 22 * 60 * 60 * 1000;

export async function matchManualLinks({ schedule, store, graph, cfg, now = Date.now(), force = false, onlyId } = {}) {
  const { posts } = validateSchedule(schedule);
  const claimed = new Set();
  const cands = [];
  for (const p of posts) {
    const state = (await store.get(p.id, { type: "json" })) || {};
    if (state.instagram?.mediaId) claimed.add(state.instagram.mediaId);
    if (state.manual?.mediaId) claimed.add(state.manual.mediaId);
    if (onlyId && p.id !== onlyId) continue;
    if (!p.manual_only || !p.platforms?.includes("instagram")) continue;
    if ((p.status || "draft") !== "ready" || state.manual?.permalink) continue;
    const t = Date.parse(p.publish_at);
    if (t > now + (force ? 3 * DAY_MS : 0) || t < now - 21 * DAY_MS) continue;
    if (p.type !== "story" && !normCaption(p.caption)) continue;
    const lc = state.linkCheck || {};
    if (!force && (lc.gaveUp || now < (lc.nextAt || 0) - LINK_CHECK_TOLERANCE_MS)) continue;
    cands.push({ p, state, t, lc });
  }
  if (!cands.length) return { matched: [], checked: 0 };

  const needFeed = cands.some((c) => c.p.type !== "story");
  const needStories = cands.some((c) => c.p.type === "story");
  // An API error (token trouble, rate limit) is not a "failed check": nothing was learned.
  const media = needFeed ? (await graph.get(`${cfg.igUserId}/media`, { fields: "id,caption,permalink,timestamp,media_product_type", limit: 50 })).data || [] : [];
  let stories = [];
  if (needStories) {
    try { stories = (await graph.get(`${cfg.igUserId}/stories`, { fields: "id,permalink,timestamp,media_type" })).data || []; } catch { stories = null; }
  }

  const matched = [];
  for (const { p, state, t, lc } of cands.sort((a, b) => a.t - b.t)) {
    let hit;
    if (p.type === "story") {
      if (stories === null) continue; // couldn't list stories this time: learned nothing
      hit = stories
        .filter((m) => !claimed.has(m.id) && Date.parse(m.timestamp) >= t - STORY_EARLY_MS && Date.parse(m.timestamp) <= t + STORY_LATE_MS)
        .sort((a, b) => Math.abs(Date.parse(a.timestamp) - t) - Math.abs(Date.parse(b.timestamp) - t))[0];
    } else {
      const want = normCaption(p.caption);
      hit = media
        .filter((m) => !claimed.has(m.id) && normCaption(m.caption) === want && Date.parse(m.timestamp) >= t - 2 * DAY_MS)
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0];
    }

    const marked = state.manual?.status === "posted";
    if (hit) {
      claimed.add(hit.id);
      const { linkCheck, ...rest } = state;
      await store.setJSON(p.id, {
        ...rest,
        manual: { ...(state.manual || {}), status: "posted", postedAt: state.manual?.postedAt || hit.timestamp, ...(hit.permalink ? { permalink: hit.permalink } : {}), mediaId: hit.id, ...(marked ? {} : { autoDetected: true }) },
      });
      matched.push({ id: p.id, permalink: hit.permalink || null, autoMarked: !marked });
      await pushNotify(cfg, {
        title: marked ? "🔗 Link saved for your manual post" : `✅ Found your manual ${p.type} on Instagram`,
        message: `${p.type} · ${shortWhen(p.publish_at)}${marked ? "" : "\nMarked as posted for you."}${hit.permalink ? "" : "\nInstagram didn't return a link; add it on the status page."}`,
        tags: ["link"], priority: 3, click: hit.permalink,
      });
      continue;
    }

    if (force) continue; // a manual refresh finding nothing changes nothing
    if (!marked) { // not posted yet, just keep watching without counting
      await store.setJSON(p.id, { ...state, linkCheck: { fails: 0, nextAt: now + 10 * 60 * 1000 } });
      continue;
    }
    const fails = (lc.fails || 0) + 1;
    if (fails >= 3) {
      await store.setJSON(p.id, { ...state, linkCheck: { fails, gaveUp: true, gaveUpAt: new Date(now).toISOString() } });
      await pushNotify(cfg, {
        title: "🔎 Couldn't find the link for a post",
        message: `${p.type} · ${shortWhen(p.publish_at)}\nIt's marked posted, but I couldn't match it on Instagram after 3 checks. Paste the link on the status page.`,
        tags: ["mag"], priority: 4,
      });
    } else {
      // after check 1 try again in 10 min; after check 2 wait 30 min for the last try
      await store.setJSON(p.id, { ...state, linkCheck: { fails, nextAt: now + (fails === 1 ? 10 : 30) * 60 * 1000 } });
    }
  }
  return { matched, checked: cands.length };
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
              next = await igPublish(post, next, graph, cfg);
            }
          } else {
            next = await fbStep(post, next, graph, cfg);
          }
          delete next._save;
          next.attempts = st.attempts || 0;
          await save(post.id, platform, next, next.status === "failed");
          (next.status === "published" ? report.acted : report.waiting).push({ id: post.id, platform, status: next.status, phase: next.phase, link: next.permalink });
          if (next.status === "published") report.notices.push({ id: post.id, platform, status: "published", link: next.permalink, type: post.type, publish_at: post.publish_at });
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

// Phone push via ntfy (https://ntfy.sh): install the free ntfy app, subscribe to the
// same topic as NTFY_TOPIC, and every call here lands as a native notification.
// Never throws: a down push service must never break a publish run. Messages carry
// post ids/types/times only (no captions) since anyone who knows the topic can read it.
const ADMIN_URL = "https://noemptychair.co/admin/social";
export async function pushNotify(cfg, { title, message, tags, priority, click } = {}) {
  if (!cfg.ntfyTopic) return { sent: false, reason: "no NTFY_TOPIC" };
  try {
    const r = await fetch(String(cfg.ntfyServer || "https://ntfy.sh").replace(/\/$/, ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: cfg.ntfyTopic, title, message, tags, priority, click: click || ADMIN_URL }),
    });
    return { sent: r.ok, status: r.status };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

const PLAT_LABEL = { instagram: "Instagram", facebook: "Facebook" };
const shortWhen = (iso) => {
  try { return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso || ""; }
};

// Turns one tick's notices into phone pushes (grouped per post so IG+FB is one buzz)
// and emails the failures. Notice shape: { id, platform, status, error?, link?, type?, publish_at? }.
export async function sendNotice(notices, cfg) {
  // Facebook is a nice-to-have here (its video posting is blocked on Meta's side), so a
  // Facebook failure stays visible on the status page but never buzzes the phone or inbox.
  notices = notices.filter((n) => !(n.platform === "facebook" && (n.status === "failed" || n.status === "missed")));
  if (!notices.length) return;

  const groups = new Map();
  for (const n of notices) {
    const key = `${n.id}|${n.status}`;
    if (!groups.has(key)) groups.set(key, { ...n, platforms: [] });
    groups.get(key).platforms.push(PLAT_LABEL[n.platform] || n.platform);
  }
  const pushes = [...groups.values()].map((g) => {
    const where = g.platforms.join(" + ");
    const what = [g.type, g.publish_at ? shortWhen(g.publish_at) : null].filter(Boolean).join(" · ") || g.id;
    if (g.status === "published") return { title: `✅ Published to ${where}`, message: what, tags: ["white_check_mark"], priority: 3, click: g.link };
    if (g.status === "missed") return { title: `⏰ Missed on ${where}`, message: `${what}\nNot started in time; it was not posted late.`, tags: ["alarm_clock"], priority: 4 };
    return { title: `❌ Failed on ${where}`, message: `${what}\n${(g.error || "").slice(0, 180)}`, tags: ["x"], priority: 5 };
  });
  for (const p of pushes.slice(0, 4)) await pushNotify(cfg, p);
  if (pushes.length > 4) await pushNotify(cfg, { title: `+${pushes.length - 4} more updates`, message: "Open the status page for the full list.", priority: 3 });

  const bad = notices.filter((n) => n.status === "failed" || n.status === "missed");
  if (!cfg.resendKey || !bad.length) return;
  const lines = bad.map((n) => `${n.id} (${n.platform}): ${n.status}${n.error ? " - " + n.error : ""}`);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "No Empty Chair Social <onboarding@resend.dev>",
      to: [cfg.notifyTo],
      subject: `Social publisher: ${bad.length} post${bad.length > 1 ? "s" : ""} need attention`,
      text: lines.join("\n") + "\n\nStatus page: " + ADMIN_URL,
    }),
  });
}

// ---------------------------------------------------------------- manual-post reminders

// Manual posts (Reels/Stories the API can't fully publish — polls, stickers, sound
// credits) never get touched by runTick. This is the parallel check: once a manual
// post's scheduled time arrives, email a one-time reminder (never repeats — tracked via
// state.manualReminder.sentAt) unless it's already been marked posted.
export async function checkManualReminders({ schedule, store, cfg = config(), now = Date.now() }) {
  if (!cfg.resendKey && !cfg.ntfyTopic) return { sent: false, reason: "no RESEND_API_KEY or NTFY_TOPIC" };
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
  if (cfg.resendKey) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "No Empty Chair Social <onboarding@resend.dev>",
        to: [cfg.notifyTo],
        subject: `🖐🏾 ${due.length} post${due.length > 1 ? "s" : ""} to post by hand today`,
        text: lines.join("\n") + "\n\nGrab the caption/media and mark it posted: " + ADMIN_URL,
      }),
    });
  }
  const shown = due.slice(0, 6).map(({ p }) => `• ${p.type} · ${shortWhen(p.publish_at)}`);
  await pushNotify(cfg, {
    title: `🖐🏾 ${due.length} post${due.length > 1 ? "s" : ""} to post by hand`,
    message: shown.join("\n") + (due.length > 6 ? `\n…and ${due.length - 6} more` : ""),
    tags: ["raised_hand"],
    priority: 4,
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
  const u = graph.usage?.();
  if (u?.app) {
    const worst = Math.max(u.app.call_count || 0, u.app.total_cputime || 0, u.app.total_time || 0);
    add("Meta API budget (app, hourly)", worst < 80, `${u.app.call_count ?? 0}% of calls · ${u.app.total_cputime ?? 0}% CPU · ${u.app.total_time ?? 0}% time used`);
  }
  if (u?.buc) {
    const first = Object.values(u.buc).flat()[0];
    if (first) add("Meta API budget (account)", (first.call_count || 0) < 80, `${first.call_count ?? 0}% of calls used${first.estimated_time_to_regain_access ? ` · blocked for ${first.estimated_time_to_regain_access} min` : ""}`);
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
// Metric bundles, richest first. Each Instagram media type accepts a different set and Meta
// renames or retires metrics between API versions, so a bundle that errors with "invalid
// metric" (code 100) just falls through to the next, smaller one. Normally the first works,
// so the usual cost is still one insights call per post.
const IG_METRIC_TIERS = {
  REELS: ["reach,saved,shares,views,total_interactions,ig_reels_avg_watch_time", "reach,saved,shares,views", "reach,saved,shares", "reach"],
  STORY: ["reach,replies,shares,total_interactions", "reach"],
  FEED: ["reach,saved,shares,views,total_interactions,profile_visits,follows", "reach,saved,shares,views", "reach,saved,shares", "reach"],
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
    const kind = media.media_product_type === "REELS" ? "REELS" : media.media_product_type === "STORY" ? "STORY" : "FEED";
    const tiers = IG_METRIC_TIERS[kind];
    for (let i = Math.min(st.stats?.metricTier ?? 0, tiers.length - 1); i < tiers.length; i++) { // resume at the bundle that worked last time
      const metric = tiers[i];
      try {
        Object.assign(out, readInsightRows((await graph.get(`${st.mediaId}/insights`, { metric })).data));
        out.metricTier = i;
        if (out.insightsError) { out.insightsNote = out.insightsError; delete out.insightsError; } // a smaller bundle worked; remember why the richer one didn't
        break;
      } catch (e) {
        out.insightsError = e.message;
        if (e.code !== 100 && !/metric/i.test(e.message || "")) break; // rate limit / outage: don't hammer, try next time
      }
    }
    if (kind !== "STORY") {
      try {
        const c = await graph.get(`${st.mediaId}/comments`, { fields: "username,text,timestamp,like_count", limit: 25 });
        out.recentComments = (c.data || []).map((x) => ({ username: x.username, text: String(x.text || "").slice(0, 400), timestamp: x.timestamp, likes: x.like_count }));
      } catch { /* comments are a nice-to-have, never block the stable counts */ }
    }
    return out;
  }
  if (platform === "facebook" && st.postId) {
    // One call. Facebook is secondary here and its Page Insights metrics keep being retired.
    const post = await graph.get(st.postId, { fields: "permalink_url,created_time,reactions.summary(true),comments.summary(true),shares" });
    const out = {
      permalink: post.permalink_url,
      postedAt: post.created_time,
      likes: post.reactions?.summary?.total_count,
      comments: post.comments?.summary?.total_count,
      shares: post.shares?.count ?? 0,
      fetchedAt: new Date().toISOString(),
    };
    try { // views: best effort, since Meta keeps renaming Facebook's Page metrics
      const v = readInsightRows((await graph.get(`${st.postId}/insights`, { metric: "post_media_view" })).data);
      if (typeof v.post_media_view === "number") out.views = v.post_media_view;
    } catch { /* leave views blank */ }
    return out;
  }
  return null;
}

// Keeps a small time series next to the latest numbers, so growth can be shown and the
// refresh cadence can be judged from real data. At most one point per hour, and only when
// something actually moved.
const HISTORY_KEYS = ["likes", "comments", "shares", "saved", "reach", "views"];
export function withHistory(prev, next) {
  const hist = Array.isArray(prev?.history) ? prev.history.slice() : [];
  const snap = { at: next.fetchedAt };
  for (const k of HISTORY_KEYS) snap[k] = k === "views" ? (next.views ?? next.plays) : next[k];
  const last = hist[hist.length - 1];
  const moved = !last || HISTORY_KEYS.some((k) => last[k] !== snap[k]);
  const gap = last ? Date.parse(next.fetchedAt) - Date.parse(last.at) : Infinity;
  if (moved && gap >= 60 * 60 * 1000) hist.push(snap);
  const merged = { ...next, history: hist.slice(-60) };
  if (!merged.recentComments && prev?.recentComments) merged.recentComments = prev.recentComments; // keep the last good list if this fetch missed it
  return merged;
}

// How often a post's numbers are re-pulled automatically, by the post's age. New posts move
// fast, old ones barely at all: hourly for the first day, twice a day through day 7, daily
// through day 30, then never (a manual refresh still reaches them).
export function statsIntervalMs(ageMs) {
  if (ageMs < 0) return Infinity;
  if (ageMs < DAY_MS) return 60 * 60 * 1000;
  if (ageMs < 7 * DAY_MS) return 12 * 60 * 60 * 1000;
  if (ageMs < 30 * DAY_MS) return DAY_MS;
  return Infinity;
}
const STATS_SLACK_MS = 10 * 60 * 1000; // ticks land a few minutes apart; don't let that skip a slot

// Walks every published post/platform in the schedule and refreshes its stats
// in the blob store in place. Returns a per-post/platform ok/error report.
//   tiered   only refresh what is due under statsIntervalMs (the automatic run)
//   onlyId   refresh a single post (the per-post button)
//   neither  refresh everything now (the Refresh stats button)
export async function refreshAllStats({ schedule, store, graph, maxAgeMs, tiered = false, onlyId, now = Date.now() }) {
  const { posts } = validateSchedule(schedule);
  const results = [];
  const dueFor = (post, stats) => {
    if (!tiered) return true;
    const every = statsIntervalMs(now - Date.parse(post.publish_at));
    if (every === Infinity) return false;
    if (!stats || !stats.fetchedAt) return true;
    if (stats.metricTier === undefined && stats.permalink && !/facebook\.com/i.test(stats.permalink)) return true; // saved by the older fetcher: re-pull once to get views, shares, saves
    return now - Date.parse(stats.fetchedAt) >= every - STATS_SLACK_MS;
  };
  for (const post of posts) {
    if (onlyId && post.id !== onlyId) continue;
    if (tiered && statsIntervalMs(now - Date.parse(post.publish_at)) === Infinity) continue; // too old or not yet live: skip the storage read too
    const state = (await store.get(post.id, { type: "json" })) || {};
    let changed = false;
    for (const platform of post.platforms || []) {
      const st = state[platform];
      if (!st || st.status !== "published") continue;
      if (maxAgeMs && Date.parse(post.publish_at) < Date.now() - maxAgeMs) continue;
      if (!dueFor(post, st.stats)) continue;
      try {
        const stats = await fetchStats(graph, platform, st);
        if (stats) {
          state[platform] = { ...st, stats: withHistory(st.stats, stats) };
          changed = true;
          results.push({ id: post.id, platform, ok: true });
        }
      } catch (e) {
        results.push({ id: post.id, platform, ok: false, error: e.message });
      }
    }
    if (state.manual?.mediaId && post.type !== "story" && !(maxAgeMs && Date.parse(post.publish_at) < Date.now() - maxAgeMs) && dueFor(post, state.manual.stats)) {
      try {
        const stats = await fetchStats(graph, "instagram", { mediaId: state.manual.mediaId, stats: state.manual.stats });
        if (stats) {
          state.manual = { ...state.manual, stats: withHistory(state.manual.stats, stats) };
          changed = true;
          results.push({ id: post.id, platform: "manual", ok: true });
        }
      } catch (e) {
        results.push({ id: post.id, platform: "manual", ok: false, error: e.message });
      }
    }
    if (changed) await store.setJSON(post.id, state);
  }
  return results;
}
