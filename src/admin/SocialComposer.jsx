import React, { useState, useEffect } from "react";
import { uploadImage, uploadMedia, cloudinaryConfigured } from "../lib/cloudinary";
import { TYPES, PLATFORMS, validatePost } from "../../netlify/lib/social-publisher.mjs";
import { useHashtags, saveHashtags } from "../hooks/useHashtags";

/* ---------- Eastern-time date/time <-> ISO helpers (mirrors scripts/social-import.mjs) ---------- */
function tzOffsetMin(utcMs) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(utcMs)).map((x) => [x.type, x.value])
  );
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUTC - utcMs) / 60000);
}
function easternISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return "";
  const [y, mo, da] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const guessUTC = Date.UTC(y, mo - 1, da, h, mi);
  const offMin = tzOffsetMin(guessUTC);
  const pad = (n) => String(n).padStart(2, "0");
  const sign = offMin <= 0 ? "-" : "+";
  const a = Math.abs(offMin);
  return `${y}-${pad(mo)}-${pad(da)}T${pad(h)}:${pad(mi)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
function isoToEasternParts(iso) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return { date: "", time: "" };
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); }
const isVideoUrl = (u) => /\.(mp4|mov)(\?|#|$)/i.test(u);
const fmt = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? "—" : new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
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

/* ---------- undo/redo history (up to 10 steps back) ---------- */
function useHistoryState(initial, limit = 10) {
  const [state, setState] = useState({ hist: [initial], idx: 0 });
  const value = state.hist[state.idx];
  const set = (patch) => setState(({ hist, idx }) => {
    const cur = hist[idx];
    const next = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
    let newHist = [...hist.slice(0, idx + 1), next];
    if (newHist.length > limit + 1) newHist = newHist.slice(newHist.length - (limit + 1));
    return { hist: newHist, idx: newHist.length - 1 };
  });
  const undo = () => setState(({ hist, idx }) => ({ hist, idx: Math.max(0, idx - 1) }));
  const redo = () => setState(({ hist, idx }) => ({ hist, idx: Math.min(hist.length - 1, idx + 1) }));
  return { value, set, undo, redo, canUndo: state.idx > 0, canRedo: state.idx < state.hist.length - 1 };
}

/* ---------- small copy-to-clipboard button, for any field ---------- */
function CopyBtn({ value, label }) {
  const [copied, setCopied] = useState(false);
  const text = typeof value === "string" ? value : Array.isArray(value) ? value.join("\n") : String(value ?? "");
  return (
    <button
      type="button"
      className="copybtn"
      title={`Copy ${label || "value"}`}
      aria-label={`Copy ${label || "value"}`}
      disabled={!text}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1100); } catch {}
      }}
    >{copied ? "✓" : "⧉"}</button>
  );
}
function FldHead({ children, value, label }) {
  return (
    <div className="fldhead">
      <label>{children}</label>
      <CopyBtn value={value} label={label} />
    </div>
  );
}

const MEDIA_HINT = {
  image: "Exactly 1 photo.",
  carousel: "2 to 10 items (Facebook can't include video if it's one of the platforms).",
  reel: "Exactly 1 video (.mp4 or .mov).",
  story: "Exactly 1 photo or video.",
};

/* ---------- media attach row ---------- */
function MediaPicker({ media, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    setErr("");
    try {
      const urls = [];
      for (const f of files) {
        const r = await uploadMedia(f);
        urls.push(r.url);
      }
      onChange([...media, ...urls]);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= media.length) return;
    const next = media.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const del = (i) => onChange(media.filter((_, k) => k !== i));

  return (
    <div className="fld">
      <label>Media {media.length > 1 ? "(order = carousel order)" : ""}</label>
      <div className="medialist">
        {media.map((m, i) => (
          <div className="mediaitem" key={i}>
            {isVideoUrl(m) ? <video src={m} muted /> : <img src={m} alt="" />}
            <div className="mediatools">
              <button type="button" className="mini" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="mini" onClick={() => move(i, 1)} disabled={i === media.length - 1}>↓</button>
              <button type="button" className="mini danger" onClick={() => del(i)}>✕</button>
            </div>
          </div>
        ))}
      </div>
      {cloudinaryConfigured() ? (
        <div className="uprow">
          <input type="file" accept="image/*,video/*" multiple onChange={pick} disabled={busy} />
          {busy ? <span className="muted">Uploading…</span> : null}
        </div>
      ) : (
        <div className="muted">Cloudinary isn't configured — paste a full media URL below instead.</div>
      )}
      <div className="addurl">
        <input
          type="text"
          placeholder="…or paste a media URL and press Enter"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value.trim()) {
              onChange([...media, e.currentTarget.value.trim()]);
              e.currentTarget.value = "";
              e.preventDefault();
            }
          }}
        />
      </div>
      {err ? <div className="err">{err}</div> : null}
    </div>
  );
}

/* ---------- the composer modal ---------- */
function PostModal({ post, onSave, onClose, allCampaigns, hashtagSets, onSaveHashtagSet }) {
  const { value: p, set, undo, redo, canUndo, canRedo } = useHistoryState(post, 10);
  const [showFbCaption, setShowFbCaption] = useState(!!post.caption_facebook);
  const [maximized, setMaximized] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { date, time } = isoToEasternParts(p.publish_at);

  const errors = validatePost(p, {});
  const changed = JSON.stringify(p) !== JSON.stringify(post);
  const requestClose = () => { if (changed) setConfirmDiscard(true); else onClose(); };
  const submit = () => { if (!errors.length) onSave(p); };

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape" && !minimized) { requestClose(); return; }
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); e.stopPropagation(); submit(); return; }
      if (k !== "z") return;
      if (/^(input|textarea)$/i.test(e.target?.tagName || "")) return; // let fields use their own undo
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (minimized) {
    return (
      <button type="button" className="minipill" onClick={() => setMinimized(false)}>
        <span className="traffic"><span className="tl tl-yellow" /></span>
        {post._isNew ? "New post" : `Edit · ${post.id}`} — click to reopen
      </button>
    );
  }

  return (
    <div className="modalveil" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div className={`modal${maximized ? " maximized" : ""}`}>
        <div className="modalhead">
          <div className="traffic">
            <button type="button" className="tl tl-red" title="Close" aria-label="Close" onClick={requestClose}>✕</button>
            <button type="button" className="tl tl-yellow" title="Minimize" aria-label="Minimize" onClick={() => setMinimized(true)}>−</button>
            <button type="button" className="tl tl-green" title={maximized ? "Restore" : "Maximize"} aria-label="Maximize" onClick={() => setMaximized((m) => !m)}>{maximized ? "⤡" : "+"}</button>
          </div>
          <b>{post._isNew ? "New post" : `Edit · ${post.id}`}</b>
          <div className="historybtns">
            <button type="button" className="mini" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)">↶ Undo</button>
            <button type="button" className="mini" disabled={!canRedo} onClick={redo} title="Redo (⌘⇧Z)">↷ Redo</button>
          </div>
        </div>

        <div className="modalbody">
          <div className="fld">
            <FldHead value={p.id} label="Post ID">Post ID</FldHead>
            <input type="text" value={p.id} onChange={(e) => set({ id: slug(e.target.value) })} />
          </div>

          <div className="grid2">
            <div className="fld">
              <FldHead value={date} label="date">Date (Eastern)</FldHead>
              <input type="date" value={date} onChange={(e) => set({ publish_at: easternISO(e.target.value, time || "12:00") })} />
            </div>
            <div className="fld">
              <FldHead value={time} label="time">Time (Eastern)</FldHead>
              <input type="time" value={time} onChange={(e) => set({ publish_at: easternISO(date || new Date().toISOString().slice(0, 10), e.target.value) })} />
            </div>
          </div>

          <div className="grid2">
            <div className="fld">
              <label>Type</label>
              <select value={p.type} onChange={(e) => set({ type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fld">
              <label>Platforms</label>
              <div className="platrow">
                {PLATFORMS.map((pl) => (
                  <label key={pl} className="switch">
                    <input
                      type="checkbox"
                      checked={(p.platforms || []).includes(pl)}
                      onChange={(e) => {
                        const cur = new Set(p.platforms || []);
                        e.target.checked ? cur.add(pl) : cur.delete(pl);
                        set({ platforms: [...cur] });
                      }}
                    />
                    {pl === "instagram" ? "Instagram" : "Facebook"}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <details className="tip">
            <summary>🖐🏾 What can't be automated? <span className="muted">(when to use "Needs manual posting")</span></summary>
            <b>Not everything Meta lets you do in-app is available through automation</b> — polls/stickers on
            Stories, the official "using sound ___" credit on Reels, and similar native-only features can't be
            attached by the API, on any post type. Turn on <b>"Needs manual posting"</b> below whenever this post
            needs one of those: it stays saved here with your caption and media as a reference, the auto-poster
            always skips it, and you finish it by hand in the app when you're ready.
            {p.type === "story" ? (
              <><br /><br />📌 For this Story: posted through the API it's photo/video only — no polls, quizzes,
              sliders, countdowns, or music.</>
            ) : null}
            {p.type === "reel" ? (
              <><br /><br />🎵 For this Reel: if you just want a trending song playing (not the official credit),
              add it to the video yourself before uploading — a baked-in audio track posts automatically, no
              manual step needed. Only the actual "using sound ___" tag requires picking it in the app.</>
            ) : null}
          </details>

          <div className="fld">
            <label className="switch manualtoggle">
              <input type="checkbox" checked={!!p.manual_only} onChange={(e) => set({ manual_only: e.target.checked })} />
              Needs manual posting (stickers/polls/etc.) — never auto-publish this one
            </label>
          </div>

          <div className="fld">
            <FldHead value={p.caption} label="caption">Caption</FldHead>
            <textarea value={p.caption || ""} onChange={(e) => set({ caption: e.target.value })} />
            <div className="muted">{(p.caption || "").length} / 2200 characters</div>
            {hashtagSets?.length ? (
              <div className="hashtagrow">
                <select
                  value=""
                  onChange={(e) => {
                    const found = hashtagSets.find((s) => s.name === e.target.value);
                    if (found) set({ caption: `${p.caption || ""}${p.caption ? "\n\n" : ""}${found.tags}` });
                  }}
                >
                  <option value="" disabled>Insert a saved hashtag set…</option>
                  {hashtagSets.map((s) => <option key={s.name} value={s.name}>{s.name} ({(s.tags.match(/#/g) || []).length})</option>)}
                </select>
                <button type="button" className="mini" onClick={() => onSaveHashtagSet(p.caption || "")}>+ Save this caption's hashtags</button>
              </div>
            ) : (
              <button type="button" className="mini" onClick={() => onSaveHashtagSet(p.caption || "")}>+ Save this caption's hashtags as a reusable set</button>
            )}
          </div>

          {showFbCaption ? (
            <div className="fld">
              <FldHead value={p.caption_facebook} label="Facebook caption">Facebook caption (different from the one above)</FldHead>
              <textarea value={p.caption_facebook || ""} onChange={(e) => set({ caption_facebook: e.target.value })} />
            </div>
          ) : (
            <button type="button" className="mini" onClick={() => setShowFbCaption(true)}>+ Use a different caption for Facebook</button>
          )}

          {!p.manual_only && (p.platforms || []).includes("instagram") ? (
            <div className="fld">
              <FldHead value={p.first_comment} label="first comment">First comment (optional)</FldHead>
              <textarea value={p.first_comment || ""} onChange={(e) => set({ first_comment: e.target.value })} />
              <div className="muted">Posted automatically on Instagram 10–40 min after this goes live (randomized so it doesn't read as a bot). Manual-only posts don't get this — add it by hand when you post.</div>
            </div>
          ) : null}

          <MediaPicker media={p.media || []} onChange={(media) => set({ media })} />
          <div className="muted mediahint">{MEDIA_HINT[p.type]}</div>

          {p.type === "reel" ? (
            <div className="fld">
              <label>Cover image (optional)</label>
              {p.cover ? <img src={p.cover} alt="" className="thumb" /> : null}
              {cloudinaryConfigured() ? (
                <input type="file" accept="image/*" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try { set({ cover: await uploadImage(f) }); } catch (ex) { /* surfaced via errors list */ }
                }} />
              ) : null}
            </div>
          ) : null}

          <div className="fld">
            <FldHead value={p.campaign} label="campaign">Campaign (optional)</FldHead>
            <input type="text" list="campaign-list" placeholder="e.g. Fall Launch" value={p.campaign || ""} onChange={(e) => set({ campaign: e.target.value })} />
            <datalist id="campaign-list">
              {(allCampaigns || []).map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div className="fld">
            <label>Status</label>
            <select value={p.status || "draft"} onChange={(e) => set({ status: e.target.value })}>
              {p.manual_only ? (
                <>
                  <option value="draft">Draft — not finalized, hidden from reminders and "Needs posting"</option>
                  <option value="ready">Ready — finalized, will show up as needing posting on its date</option>
                  <option value="paused">Paused — was ready, temporarily held out of reminders</option>
                </>
              ) : (
                <>
                  <option value="draft">Draft — never auto-posts</option>
                  <option value="ready">Ready — will auto-post at the scheduled time</option>
                  <option value="paused">Paused — was ready, temporarily held</option>
                </>
              )}
            </select>
            {p.manual_only ? <div className="muted">Manual posts never auto-publish regardless of status — this only controls when it shows up as something you need to go post.</div> : null}
          </div>

          <div className="fld">
            <label className="switch evergreentoggle">
              <input type="checkbox" checked={!!p.evergreen} onChange={(e) => set({ evergreen: e.target.checked })} />
              🌲 Evergreen — not tied to this date, safe to duplicate into future months
            </label>
            {p.evergreen ? <div className="muted">Reminder: swap in a fresh caption each time you reuse it, so it doesn't repeat.</div> : null}
          </div>

          {errors.length ? (
            <div className="warn">
              <b>Fix before this can be added:</b>
              <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          ) : null}
        </div>

        {confirmDiscard ? (
          <div className="modalfoot discardbar" role="alertdialog" aria-label="Discard changes?">
            <span>Discard what you've changed on this post?</span>
            <div className="footbtns">
              <button type="button" className="mini" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
              <button type="button" className="mini danger" onClick={onClose}>Discard changes</button>
            </div>
          </div>
        ) : (
          <div className="modalfoot">
            <span className="footnote">{errors.length ? `${errors.length} thing${errors.length > 1 ? "s" : ""} to fix first` : changed ? "Unsaved edits" : "No changes yet"}</span>
            <div className="footbtns">
              <button type="button" className="mini" onClick={requestClose}>Cancel</button>
              <button type="button" className="save" disabled={errors.length > 0 || (!changed && !post._isNew)} onClick={submit}>
                {post._isNew ? "Add to calendar" : "Save post"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- the calendar list ---------- */
export default function SocialCalendar({ schedule, setSchedule, password }) {
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null); // { msg, undo? }
  const toastTimer = React.useRef(0);
  const notify = (msg, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 8000 : 4000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const posts = schedule?.posts || [];
  const { hashtags, setHashtags } = useHashtags();
  const [live, setLive] = useState(null); // server-side state (permalink/stats) keyed by post id
  const [refreshing, setRefreshing] = useState(false);

  const loadLive = () => {
    fetch(`/admin/social?format=json&t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.posts) setLive(Object.fromEntries(d.posts.map((p) => [p.id, p.state]))); })
      .catch(() => {});
  };
  useEffect(loadLive, []);

  const refreshStats = async () => {
    setRefreshing(true);
    try {
      await fetch("/admin/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh-stats" }) });
      loadLive();
    } finally {
      setRefreshing(false);
    }
  };

  const allCampaigns = [...new Set(posts.map((p) => p.campaign).filter(Boolean))].sort();

  const onSaveHashtagSet = async (captionText) => {
    const tags = (captionText.match(/#[\p{L}\p{N}_]+/gu) || []).join(" ");
    if (!tags) { notify("That caption doesn't have any hashtags to save."); return; }
    const name = prompt("Name this hashtag set (e.g. \"Color launch\"):");
    if (!name) return;
    const nextSets = [...(hashtags?.sets || []).filter((s) => s.name !== name), { name, tags }];
    try {
      await saveHashtags(password, { sets: nextSets });
      setHashtags({ sets: nextSets });
      notify(`Saved hashtag set "${name}".`);
    } catch (ex) {
      notify("Couldn't save the hashtag set: " + ex.message);
    }
  };

  const blankPost = () => ({
    _isNew: true,
    id: "",
    publish_at: "",
    type: "image",
    platforms: ["instagram", "facebook"],
    media: [],
    caption: "",
    campaign: "",
    status: "draft",
    manual_only: false,
  });

  const upsert = (post) => {
    const clean = { ...post };
    delete clean._isNew;
    if (!clean.caption_facebook) delete clean.caption_facebook;
    if (!clean.cover) delete clean.cover;
    const byId = new Map(posts.map((x) => [x.id, x]));
    if (editing && !editing._isNew && editing.id !== clean.id) byId.delete(editing.id);
    byId.set(clean.id, clean);
    const wasNew = !!editing?._isNew;
    setSchedule({ ...schedule, posts: [...byId.values()].sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at)) });
    setEditing(null);
    notify(wasNew ? "Post added. Save & Deploy when you're ready to publish it." : "Post updated. Save & Deploy when you're ready.");
  };

  const del = (post) => {
    const before = schedule;
    setSchedule({ ...schedule, posts: posts.filter((x) => x.id !== post.id) });
    notify(`Deleted "${post.id}".`, () => { setSchedule(before); setToast(null); });
  };

  const [filter, setFilter] = useState("all");
  const counts = {
    all: posts.length,
    ready: posts.filter((p) => (p.status || "draft") === "ready" && !p.manual_only).length,
    draft: posts.filter((p) => (p.status || "draft") !== "ready" && !p.manual_only).length,
    manual: posts.filter((p) => p.manual_only).length,
    evergreen: posts.filter((p) => p.evergreen).length,
  };
  const shown = posts
    .filter((p) => {
      if (filter === "all") return true;
      if (filter === "evergreen") return !!p.evergreen;
      if (filter === "manual") return !!p.manual_only;
      if (p.manual_only) return false;
      return (p.status || "draft") === filter || (filter === "draft" && (p.status || "draft") === "paused");
    })
    .slice()
    .sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));

  return (
    <div className="social-calendar">
      <div className="calhead">
        <button type="button" className="save" onClick={() => setEditing(blankPost())}>+ New post</button>
        <a href="/admin/social" target="_blank" rel="noopener noreferrer" className="mini">Open publisher status ↗</a>
        <button type="button" className="mini" onClick={refreshStats} disabled={refreshing}>{refreshing ? "Refreshing…" : "↻ Refresh stats"}</button>
      </div>

      <div className="calfilters">
        {[["all", "All"], ["ready", "Ready"], ["draft", "Draft"], ["manual", "Manual"], ["evergreen", "🌲 Evergreen"]].map(([k, label]) => (
          <button type="button" key={k} className={`filterchip${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>
            {label} <span className="filtercount">{counts[k]}</span>
          </button>
        ))}
      </div>

      {!posts.length ? (
        <div className="calempty">No posts yet — click "+ New post" to add your first one.</div>
      ) : !shown.length ? (
        <div className="calempty">Nothing in "{filter}" right now.</div>
      ) : null}

      <div className="calgrid">
        {shown.map((post) => {
          const thumb = post.media?.[0];
          const liveState = live?.[post.id];
          return (
            <div className="calcard" key={post.id}>
              <div className="calthumb">
                {thumb ? (isVideoUrl(thumb) ? <video src={thumb} muted /> : <img src={thumb} alt="" />) : <div className="calthumb-empty">{TYPE_ICON[post.type] || "🖼️"}</div>}
                <div className="calplatbadges">
                  {(post.platforms || []).includes("instagram") ? <span className="platbadge pb-ig">IG</span> : null}
                  {(post.platforms || []).includes("facebook") ? <span className="platbadge pb-fb">FB</span> : null}
                </div>
              </div>
              <div className="calbody">
                <div className="calrow1">
                  <span className="calwhen">{fmt(post.publish_at)}</span>
                  <span className={`pill st-${post.manual_only ? "manual" : (post.status || "draft")}`}>{post.manual_only ? "🖐🏾 manual" : (post.status || "draft")}</span>
                </div>
                <div className="caltype">{TYPE_ICON[post.type] || ""} {post.type}{post.evergreen ? <span className="evergreenbadge">🌲 evergreen</span> : null}{post.campaign ? <span className="campaignbadge">🏷 {post.campaign}</span> : null}</div>
                <div className="calcap">{(post.caption || "").slice(0, 90) || <span className="muted">no caption</span>}</div>
                {(post.platforms || []).map((pl) => {
                  const st = liveState?.[pl];
                  if (!st || st.status !== "published") return null;
                  const s = st.stats;
                  return (
                    <div className="tracking" key={pl}>
                      {s?.permalink || st.permalink ? <a href={s?.permalink || st.permalink} target="_blank" rel="noopener noreferrer">{pl === "instagram" ? "IG" : "FB"} ↗</a> : <span>{pl === "instagram" ? "IG" : "FB"}</span>}
                      {s?.postedAt ? <span> · posted {timeAgo(s.postedAt)}</span> : null}
                      {typeof s?.likes === "number" ? <span> · ❤️ {s.likes.toLocaleString()}</span> : null}
                      {typeof s?.comments === "number" ? <span> · 💬 {s.comments.toLocaleString()}</span> : null}
                      {typeof s?.reach === "number" ? <span> · 👁 {s.reach.toLocaleString()}</span> : null}
                      {typeof s?.plays === "number" ? <span> · ▶ {s.plays.toLocaleString()}</span> : null}
                      {!s ? <span className="muted"> · no stats yet — try Refresh stats</span> : null}
                    </div>
                  );
                })}
                {post.manual_only ? (
                  liveState?.manual?.status === "posted" ? (
                    <div className="tracking posted">
                      ✅ Posted {timeAgo(liveState.manual.postedAt)}
                      {liveState.manual.permalink ? <> · <a href={liveState.manual.permalink} target="_blank" rel="noopener noreferrer">view ↗</a></> : <span className="muted"> (no link saved)</span>}
                    </div>
                  ) : (post.status || "draft") === "ready" ? (
                    <div className="tracking muted">🖐🏾 needs posting by hand</div>
                  ) : null
                ) : null}
                <div className="caltools">
                  <button type="button" className="mini" onClick={() => setEditing(post)}>Edit</button>
                  <button type="button" className="mini" onClick={() => setEditing({ ...post, id: slug(post.id + "-copy"), _isNew: true })}>Duplicate</button>
                  <button type="button" className="mini danger" onClick={() => del(post)}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.msg}</span>
          {toast.undo ? <button type="button" onClick={toast.undo}>Undo</button> : null}
        </div>
      ) : null}

      {editing ? (
        <PostModal
          post={editing}
          onSave={upsert}
          onClose={() => setEditing(null)}
          allCampaigns={allCampaigns}
          hashtagSets={hashtags?.sets}
          onSaveHashtagSet={onSaveHashtagSet}
        />
      ) : null}
    </div>
  );
}

export const SOCIAL_CSS = `
.social-calendar{max-width:960px;margin:24px auto;padding:0 20px;}
.calhead{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:18px;}
.calstats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;}
.statcard{border:1px solid #e6ddec;border-radius:14px;padding:14px 16px;background:rgba(255,255,255,.6);display:flex;flex-direction:column;gap:2px;}
.statcard b{font-family:'Cinzel',serif;font-size:24px;color:#413645;}
.statcard span{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a7f86;}
.statcard.st-ready b{color:#1d6b3a;}
.statcard.st-draft b{color:#6e6172;}
.statcard.st-manual b{color:#7a5200;}
.calfilters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
.filterchip{background:none;border:1px solid #e6ddec;min-height:40px;padding:0 16px;border-radius:100px;font-size:13px;font-weight:600;color:#6e6172;cursor:pointer;transition:background .15s,color .15s;}
.filterchip:hover{background:rgba(255,255,255,.6);}
.filterchip.active{background:#413645;color:#fff;border-color:#413645;}
.filtercount{opacity:.7;font-weight:400;}
.calempty{padding:30px 16px;text-align:center;color:#8a7f86;font-size:14px;border:1px dashed #e2d6ea;border-radius:14px;}
.calgrid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;}
.calcard{min-width:0;border:1px solid #e6ddec;border-radius:14px;padding:12px;background:rgba(255,255,255,.65);display:flex;gap:14px;}
.calthumb{position:relative;width:72px;height:72px;flex-shrink:0;border-radius:10px;overflow:hidden;background:#efe8f2;}
.calthumb img,.calthumb video{width:100%;height:100%;object-fit:cover;display:block;}
.calthumb-empty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;}
.calplatbadges{position:absolute;bottom:3px;left:3px;display:flex;gap:3px;}
.platbadge{font-size:9px;font-weight:700;padding:1px 4px;border-radius:4px;color:#fff;letter-spacing:.02em;}
.pb-ig{background:linear-gradient(45deg,#f09433,#dc2743,#bc1888);}
.pb-fb{background:#1877f2;}
.calbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.calrow1{display:flex;justify-content:space-between;align-items:center;gap:8px;}
.calwhen{font-weight:600;font-size:14px;}
.caltype{text-transform:capitalize;font-size:12px;color:#8a7f86;}
.campaignbadge{margin-left:8px;text-transform:none;color:#a85a76;font-weight:600;}
.evergreenbadge{margin-left:8px;text-transform:none;color:#1d6b3a;font-weight:600;}
.evergreentoggle{font-size:13px;}
.tracking{font-size:11px;color:#5a3f4e;margin-top:2px;}
.tracking.posted{color:#1d6b3a;}
.tracking.muted{color:#8a7f86;}
.tracking a{color:#a85a76;font-weight:600;text-decoration:none;}
.hashtagrow{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;}
.hashtagrow select{width:auto;flex:1;min-width:160px;}
.calcap{font-size:13px;color:#413645;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.caltools{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;}
.calcard{transition:box-shadow .15s,transform .15s;}
.calcard:hover{box-shadow:0 10px 28px rgba(65,54,69,.1);}
.pill{display:inline-block;padding:1px 9px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;}
.st-ready{background:#dff3e6;color:#1d6b3a;}
.st-draft{background:#eee;color:#666;}
.st-paused{background:#fff1d6;color:#7a5200;}
.st-manual{background:#fdecc8;color:#7a5200;}
.modalveil{position:fixed;inset:0;background:rgba(40,32,42,.4);backdrop-filter:blur(6px) saturate(140%);-webkit-backdrop-filter:blur(6px) saturate(140%);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px;}
.modal{background:rgba(255,255,255,.72);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,.6);border-radius:18px;max-width:560px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 70px rgba(40,32,42,.35),inset 0 1px 0 rgba(255,255,255,.7);transition:max-width .18s ease,max-height .18s ease;}
.modal.maximized{max-width:96vw;max-height:96vh;}
.modalhead{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(230,221,236,.8);font-family:'Cinzel',serif;background:rgba(255,255,255,.4);}
.modalhead b{flex:1;text-align:center;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.traffic{display:flex;gap:8px;align-items:center;}
.tl{position:relative;width:14px;height:14px;border-radius:100%;border:none;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;color:transparent;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.12);}
.tl::after{content:"";position:absolute;inset:-9px;}
.tl:hover,.tl:focus-visible{color:rgba(70,30,10,.65);}
.traffic{gap:12px;}
.tl-red{background:#ff5f57;}
.tl-yellow{background:#febc2e;}
.tl-green{background:#28c840;}
.historybtns{display:flex;gap:6px;}
.minipill{position:fixed;right:22px;bottom:22px;z-index:100;display:flex;align-items:center;gap:8px;background:rgba(65,54,69,.92);color:#fff;border:none;border-radius:100px;padding:10px 16px 10px 12px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 10px 30px rgba(40,32,42,.35);backdrop-filter:blur(10px);}
.minipill .traffic{pointer-events:none;}
.minipill .tl{box-shadow:none;}
.modalbody{padding:18px 20px;overflow-y:auto;}
.modalfoot{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid rgba(230,221,236,.8);background:rgba(255,255,255,.4);flex-wrap:wrap;}
.footnote{font-size:12px;color:#8a7f86;}
.footbtns{display:flex;gap:10px;margin-left:auto;}
.discardbar{background:rgba(255,241,214,.9);color:#7a5200;font-size:14px;font-weight:600;}
.toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:95;max-width:min(560px,calc(100vw - 24px));display:flex;align-items:center;gap:14px;padding:12px 14px 12px 18px;border-radius:100px;background:rgba(65,54,69,.95);color:#fff;font-size:14px;box-shadow:0 12px 34px rgba(40,32,42,.35);animation:toastIn .2s ease-out;}
.toast button{font:inherit;font-weight:700;color:#f3c9d3;background:rgba(255,255,255,.12);border:none;min-height:36px;padding:0 16px;border-radius:100px;cursor:pointer;}
.toast button:hover{background:rgba(255,255,255,.2);}
@keyframes toastIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
.modal :focus-visible,.social-calendar :focus-visible{outline:2px solid #a85a76;outline-offset:2px;}
@media (max-width:640px){
  .social-calendar{padding:0 14px;}
  .calcard{gap:12px;padding:10px;}
  .calthumb{width:64px;height:64px;}
  .caltools .mini{flex:1;}
  .modalveil{padding:0;align-items:stretch;}
  .modal{max-width:100%;max-height:100vh;border-radius:0;background:rgba(255,253,251,.98);}
  .grid2{grid-template-columns:1fr;}
  .footbtns{width:100%;}
  .footbtns>*{flex:1;}
  .footnote{width:100%;}
}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.platrow{display:flex;gap:16px;}
.manualtoggle{font-size:13px;}
.modal .tip{background:rgba(239,232,242,.8);color:#5a3f4e;border-radius:12px;padding:12px 14px;font-size:13px;margin:14px 0;line-height:1.5;}
.modal .warn{background:rgba(253,236,200,.85);color:#7a5200;border-radius:12px;padding:12px 14px;margin:14px 0;font-size:13px;line-height:1.5;}
.modal .warn ul{margin:6px 0 0;padding-left:18px;}
.modal .err{color:#8c2f2f;font-size:12px;margin-top:6px;}
.modal .muted{color:#8a7f86;font-size:12px;margin-top:5px;}
.modal .tip summary{cursor:pointer;font-weight:700;min-height:28px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.modal .tip summary .muted{margin:0;font-weight:400;}
.modal .tip[open] summary{margin-bottom:8px;}
.modal .fld .mini,.modal .fld>.hashtagrow .mini{align-self:flex-start;}
.modal .switch{min-height:44px;cursor:pointer;line-height:1.35;}
.modal .switch input{width:20px;height:20px;padding:0;accent-color:#a85a76;flex-shrink:0;}
.modal .fld{margin:0 0 16px;display:flex;flex-direction:column;gap:6px;}
.modal .fld:last-child{margin-bottom:0;}
.modal .fld>label{font-size:12px;font-weight:700;color:#5a3f4e;letter-spacing:.02em;text-transform:none;}
.fldhead{display:flex;justify-content:space-between;align-items:center;gap:8px;}
.fldhead label{flex:1;margin-bottom:0!important;}
.copybtn{border:none;background:rgba(65,54,69,.08);color:#6e6172;width:22px;height:22px;flex-shrink:0;border-radius:7px;cursor:pointer;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;}
.copybtn:hover:not(:disabled){background:rgba(65,54,69,.16);}
.copybtn:disabled{opacity:.35;cursor:default;}
.modal .fld input[type=text],.modal .fld input[type=date],.modal .fld input[type=time],.modal .fld select,.modal .fld textarea{width:100%;border:1px solid #e6ddec;border-radius:10px;padding:9px 11px;font:inherit;font-size:13px;background:rgba(255,255,255,.75);color:#413645;}
.modal .fld input:focus,.modal .fld select:focus,.modal .fld textarea:focus{outline:2px solid rgba(168,90,118,.35);outline-offset:1px;}
.modal .fld textarea{min-height:110px;resize:vertical;line-height:1.5;}
.medialist{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px;}
.mediaitem{position:relative;width:84px;}
.mediaitem img,.mediaitem video{width:84px;height:84px;object-fit:cover;border-radius:10px;display:block;}
.mediatools{display:flex;gap:2px;justify-content:center;margin-top:3px;}
.addurl{margin-top:8px;}
.mediahint{margin-top:-6px;margin-bottom:14px;}
`;
