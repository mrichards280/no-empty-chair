import React, { useState } from "react";
import { uploadImage, uploadMedia, cloudinaryConfigured } from "../lib/cloudinary";
import { TYPES, PLATFORMS, validatePost } from "../../netlify/lib/social-publisher.mjs";

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
function PostModal({ post, onSave, onClose }) {
  const [p, setP] = useState(post);
  const [showFbCaption, setShowFbCaption] = useState(!!post.caption_facebook);
  const { date, time } = isoToEasternParts(p.publish_at);
  const set = (patch) => setP({ ...p, ...patch });

  const errors = validatePost(p, {});

  return (
    <div className="modalveil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modalhead">
          <b>{post._isNew ? "New post" : `Edit · ${post.id}`}</b>
          <button type="button" className="mini" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modalbody">
          <div className="fld">
            <label>Post ID</label>
            <input type="text" value={p.id} onChange={(e) => set({ id: slug(e.target.value) })} />
          </div>

          <div className="grid2">
            <div className="fld">
              <label>Date (Eastern)</label>
              <input type="date" value={date} onChange={(e) => set({ publish_at: easternISO(e.target.value, time || "12:00") })} />
            </div>
            <div className="fld">
              <label>Time (Eastern)</label>
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

          {p.type === "story" ? (
            <div className="tip">
              📌 Stories posted through the API are photo/video only — Instagram and Facebook don't let automation
              attach polls, quizzes, sliders, countdowns, or music. If this Story needs any of those, turn on
              <b> "Needs manual posting"</b> below: it'll stay saved here with your caption and media as a
              reference, but the auto-poster will always skip it. Add the stickers and post it yourself in the app
              when it's ready.
            </div>
          ) : null}

          <div className="fld">
            <label className="switch manualtoggle">
              <input type="checkbox" checked={!!p.manual_only} onChange={(e) => set({ manual_only: e.target.checked })} />
              Needs manual posting (stickers/polls/etc.) — never auto-publish this one
            </label>
          </div>

          <div className="fld">
            <label>Caption</label>
            <textarea value={p.caption || ""} onChange={(e) => set({ caption: e.target.value })} />
            <div className="muted">{(p.caption || "").length} / 2200 characters</div>
          </div>

          {showFbCaption ? (
            <div className="fld">
              <label>Facebook caption (different from the one above)</label>
              <textarea value={p.caption_facebook || ""} onChange={(e) => set({ caption_facebook: e.target.value })} />
            </div>
          ) : (
            <button type="button" className="mini" onClick={() => setShowFbCaption(true)}>+ Use a different caption for Facebook</button>
          )}

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
            <label>Status</label>
            <select value={p.status || "draft"} onChange={(e) => set({ status: e.target.value })}>
              <option value="draft">Draft — never posts</option>
              <option value="ready">Ready — will post at the scheduled time</option>
              <option value="paused">Paused — was ready, temporarily held</option>
            </select>
          </div>

          {errors.length ? (
            <div className="warn">
              <b>Fix before this can be added:</b>
              <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          ) : null}
        </div>

        <div className="modalfoot">
          <button type="button" className="mini" onClick={onClose}>Cancel</button>
          <button type="button" className="save" disabled={errors.length > 0} onClick={() => onSave(p)}>
            {post._isNew ? "Add to calendar" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- the calendar list ---------- */
export default function SocialCalendar({ schedule, setSchedule, password, onSave }) {
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("");
  const posts = schedule?.posts || [];

  const blankPost = () => ({
    _isNew: true,
    id: "",
    publish_at: "",
    type: "image",
    platforms: ["instagram", "facebook"],
    media: [],
    caption: "",
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
    setSchedule({ ...schedule, posts: [...byId.values()].sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at)) });
    setEditing(null);
  };

  const del = (post) => {
    if (!confirm(`Delete "${post.id}"? This can't be undone once you Save & Deploy.`)) return;
    setSchedule({ ...schedule, posts: posts.filter((x) => x.id !== post.id) });
  };

  const save = async () => {
    setStatus("Saving & deploying…");
    try {
      await onSave();
      setStatus("Saved. The live calendar and the auto-poster will pick it up after redeploy (about a minute).");
    } catch (ex) {
      const detail = ex.problems ? " " + ex.problems.map((p) => `${p.id}: ${p.errors.join("; ")}`).join(" | ") : "";
      setStatus("Error: " + ex.message + detail);
    }
  };

  return (
    <div className="social-calendar">
      <div className="calhead">
        <button type="button" className="save" onClick={() => setEditing(blankPost())}>+ New post</button>
        <a href="/admin/social" target="_blank" rel="noopener noreferrer" className="mini">Open publisher status ↗</a>
        <button type="button" className="save" onClick={save}>Save &amp; Deploy</button>
      </div>
      {status ? <div className="statusbar">{status}</div> : null}

      {!posts.length ? <div className="muted">No posts yet — click "+ New post" to add one.</div> : null}

      <div className="calgrid">
        {posts.slice().sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at)).map((post) => (
          <div className="calcard" key={post.id}>
            <div className="calwhen">{fmt(post.publish_at)}</div>
            <div className="caltype">{post.type} <span className={`pill st-${post.status || "draft"}`}>{post.status || "draft"}</span></div>
            <div className="calplat">{(post.platforms || []).join(" + ")}</div>
            {post.manual_only ? <div className="manualbadge">🖐 manual</div> : null}
            <div className="calcap">{(post.caption || "").slice(0, 70) || <span className="muted">no caption</span>}</div>
            <div className="caltools">
              <button type="button" className="mini" onClick={() => setEditing(post)}>Edit</button>
              <button type="button" className="mini" onClick={() => setEditing({ ...post, id: slug(post.id + "-copy"), _isNew: true })}>Duplicate</button>
              <button type="button" className="mini danger" onClick={() => del(post)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {editing ? <PostModal post={editing} onSave={upsert} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

export const SOCIAL_CSS = `
.social-calendar{max-width:900px;margin:24px auto;padding:0 20px;}
.calhead{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
.calgrid{display:grid;gap:10px;}
.calcard{border:1px solid #e6ddec;border-radius:12px;padding:12px 16px;background:rgba(255,255,255,.6);display:grid;gap:4px;}
.calwhen{font-weight:600;font-size:14px;}
.caltype{text-transform:capitalize;font-size:13px;color:#6e6172;display:flex;gap:8px;align-items:center;}
.calplat{font-size:12px;color:#8a7f86;text-transform:capitalize;}
.calcap{font-size:13px;color:#413645;}
.manualbadge{font-size:11px;color:#7a5200;font-weight:600;}
.caltools{display:flex;gap:8px;margin-top:6px;}
.pill{display:inline-block;padding:1px 9px;border-radius:999px;font-size:11px;font-weight:600;}
.st-ready{background:#dff3e6;color:#1d6b3a;}
.st-draft{background:#eee;color:#666;}
.st-paused{background:#fff1d6;color:#7a5200;}
.modalveil{position:fixed;inset:0;background:rgba(65,54,69,.45);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px;}
.modal{background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;}
.modalhead{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e6ddec;font-family:'Cinzel',serif;}
.modalbody{padding:16px 20px;overflow-y:auto;}
.modalfoot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e6ddec;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.platrow{display:flex;gap:16px;}
.manualtoggle{font-size:13px;}
.tip{background:#efe8f2;color:#5a3f4e;border-radius:12px;padding:10px 14px;font-size:13px;margin:10px 0;line-height:1.5;}
.medialist{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px;}
.mediaitem{position:relative;width:84px;}
.mediaitem img,.mediaitem video{width:84px;height:84px;object-fit:cover;border-radius:10px;display:block;}
.mediatools{display:flex;gap:2px;justify-content:center;margin-top:3px;}
.addurl{margin-top:8px;}
.mediahint{margin-top:-4px;margin-bottom:10px;}
`;
