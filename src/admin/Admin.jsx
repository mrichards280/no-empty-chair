import React, { useState, useEffect } from "react";
import { useContent, verifyPassword, saveContent } from "../hooks/useContent";
import { useSchedule, saveSchedule } from "../hooks/useSchedule";
import { uploadImage, cloudinaryConfigured } from "../lib/cloudinary";
import SocialCalendar, { SOCIAL_CSS } from "./SocialComposer";

/* ---------- immutable helpers ---------- */
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
function isImageKey(key) {
  return /photo|image|avatar|thumbnail/i.test(key);
}
function looksLong(key, val) {
  return typeof val === "string" && (val.length > 60 || /desc|intro|sub|paragraph|note|bio|tagline|body/i.test(key));
}
const ACRONYMS = new Set(["cta", "ig", "faq", "url", "id", "seo"]);
function prettyLabel(key) {
  const words = String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}
const SECTION_ICONS = {
  brand: "🏷️", hero: "🎯", strip: "📣", gap: "🔀", packages: "💼", consults: "🗓️",
  alacarte: "🍽️", proof: "⭐", work: "🖼️", founder: "👤", process: "🔁",
  faq: "❓", demos: "🎨", contact: "✉️", footer: "📄", radar: "📡",
};

/* ---------- field renderers ---------- */
function ImageField({ label, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fld">
      <label>{prettyLabel(label)}</label>
      {value ? <img src={value} alt="" className="thumb" /> : null}
      <input type="text" value={value || ""} placeholder="Image URL" onChange={(e) => onChange(e.target.value)} />
      {cloudinaryConfigured() ? (
        <div className="uprow">
          <input type="file" accept="image/*" onChange={pick} disabled={busy} />
          {busy ? <span className="muted">Uploading…</span> : null}
        </div>
      ) : (
        <div className="muted">Paste an image URL (Cloudinary not configured).</div>
      )}
      {err ? <div className="err">{err}</div> : null}
    </div>
  );
}

function StringList({ label, list, onChange }) {
  const set = (i, v) => {
    const next = clone(list);
    next[i] = v;
    onChange(next);
  };
  const add = () => onChange([...(list || []), ""]);
  const del = (i) => onChange(list.filter((_, j) => j !== i));
  return (
    <div className="fld">
      <label>{prettyLabel(label)}</label>
      {(list || []).map((item, i) => (
        <div className="listrow" key={i}>
          <input type="text" value={item} onChange={(e) => set(i, e.target.value)} />
          <button type="button" className="mini danger" onClick={() => del(i)} aria-label={`Remove item ${i + 1}`}>✕</button>
        </div>
      ))}
      <button type="button" className="mini" onClick={add}>+ Add</button>
    </div>
  );
}

function Value({ keyName, value, onChange }) {
  if (typeof value === "boolean") {
    return (
      <div className="fld">
        <label>{prettyLabel(keyName)}</label>
        <label className="switch">
          <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {value ? "Yes" : "No"}
        </label>
      </div>
    );
  }
  if (typeof value === "string" || typeof value === "number") {
    if (isImageKey(keyName)) return <ImageField label={keyName} value={value} onChange={onChange} />;
    if (looksLong(keyName, value))
      return (
        <div className="fld">
          <label>{prettyLabel(keyName)}</label>
          <textarea value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    return (
      <div className="fld">
        <label>{prettyLabel(keyName)}</label>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string")) return <StringList label={keyName} list={value} onChange={onChange} />;
    // array of objects
    const setItem = (i, v) => {
      const next = clone(value);
      next[i] = v;
      onChange(next);
    };
    const addItem = () => {
      const template = value[0] ? clone(value[0]) : {};
      Object.keys(template).forEach((k) => {
        if (typeof template[k] === "string") template[k] = "";
        else if (Array.isArray(template[k])) template[k] = [];
        else if (typeof template[k] === "boolean") template[k] = false;
      });
      onChange([...value, template]);
    };
    const delItem = (i) => onChange(value.filter((_, j) => j !== i));
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= value.length) return;
      const next = clone(value);
      [next[i], next[j]] = [next[j], next[i]];
      onChange(next);
    };
    return (
      <div className="fld">
        <label>{prettyLabel(keyName)}</label>
        {value.map((item, i) => (
          <div className="objcard" key={i}>
            <div className="objtools">
              <span>#{i + 1}</span>
              <div>
                <button type="button" className="mini" onClick={() => move(i, -1)} aria-label={`Move item ${i + 1} up`}>↑</button>
                <button type="button" className="mini" onClick={() => move(i, 1)} aria-label={`Move item ${i + 1} down`}>↓</button>
                <button type="button" className="mini danger" onClick={() => delItem(i)}>Delete</button>
              </div>
            </div>
            {Object.keys(item).map((k) => (
              <Value key={k} keyName={k} value={item[k]} onChange={(v) => setItem(i, { ...item, [k]: v })} />
            ))}
          </div>
        ))}
        <button type="button" className="mini" onClick={addItem}>+ Add item</button>
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <div className="objnest">
        {Object.keys(value).map((k) => (
          <Value key={k} keyName={k} value={value[k]} onChange={(v) => onChange({ ...value, [k]: v })} />
        ))}
      </div>
    );
  }
  return null;
}

const REMEMBER_KEY = "nec-admin-remember";

/* ---------- main admin ---------- */
export default function Admin() {
  const { content, setContent, loading } = useContent();
  const { schedule, setSchedule, loading: schedLoading } = useSchedule();
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checkingRemembered, setCheckingRemembered] = useState(true);
  const [remember, setRemember] = useState(true);
  const [authErr, setAuthErr] = useState("");
  const [status, setStatus] = useState("");
  const [activeSection, setActiveSection] = useState(null);
  const [sectionQuery, setSectionQuery] = useState("");
  const [tab, setTab] = useState("content");
  const [savedSnapshot, setSavedSnapshot] = useState(null);

  useEffect(() => {
    let stored;
    try { stored = localStorage.getItem(REMEMBER_KEY); } catch { stored = null; }
    if (!stored) { setCheckingRemembered(false); return; }
    verifyPassword(stored).then((ok) => {
      if (ok) { setPassword(stored); setAuthed(true); }
      else { try { localStorage.removeItem(REMEMBER_KEY); } catch {} }
      setCheckingRemembered(false);
    });
  }, []);

  useEffect(() => {
    if (content && !activeSection) setActiveSection(Object.keys(content)[0]);
    if (content && savedSnapshot === null) setSavedSnapshot(JSON.stringify(content));
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = savedSnapshot !== null && content && JSON.stringify(content) !== savedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // The live-site Arrange tool only activates for someone who has actually
  // logged in here (the "second gate"), not just anyone who reached /admin.
  useEffect(() => {
    try {
      if (authed) localStorage.setItem("nec-admin-edit", "1");
      else localStorage.removeItem("nec-admin-edit");
    } catch {}
  }, [authed]);

  const login = async (e) => {
    e.preventDefault();
    setAuthErr("");
    const ok = await verifyPassword(password);
    if (ok) {
      setAuthed(true);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, password);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {}
    } else setAuthErr("Wrong password, or the save function isn't configured yet.");
  };

  const signOut = () => {
    try { localStorage.removeItem(REMEMBER_KEY); } catch {}
    setAuthed(false);
    setPassword("");
  };

  const save = async () => {
    setStatus("Saving & deploying…");
    try {
      await saveContent(password, content);
      setSavedSnapshot(JSON.stringify(content));
      setStatus("Saved. Your site will redeploy in about a minute.");
    } catch (ex) {
      setStatus("Error: " + ex.message);
    }
  };

  const setSection = (key, val) => setContent({ ...content, [key]: val });
  const sectionKeys = content ? Object.keys(content) : [];
  const visibleKeys = sectionKeys.filter((k) => prettyLabel(k).toLowerCase().includes(sectionQuery.toLowerCase()));

  return (
    <div className="admin">
      <style>{ADMIN_CSS}</style>

      {checkingRemembered ? (
        <div className="loading">Signing you in…</div>
      ) : !authed ? (
        <div className="loginwrap">
          <form className="loginbox" onSubmit={login}>
            <div className="logo">No Empty <span>Chair</span> · Admin</div>
            <p className="muted">Sign in to edit your site content.</p>
            <label className="visually-hidden" htmlFor="nec-admin-password">Admin password</label>
            <input id="nec-admin-password" type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className="switch rememberrow">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in on this device
            </label>
            <button className="save" type="submit">Sign in</button>
            {authErr ? <div className="err" role="status" aria-live="polite">{authErr}</div> : null}
          </form>
        </div>
      ) : (
        <div className="editor">
          <div className="topbar">
            <div className="logo">No Empty <span>Chair</span> · Editor</div>
            <div className="tabs">
              <button type="button" className={`tabbtn${tab === "content" ? " active" : ""}`} onClick={() => setTab("content")}>Site content</button>
              <button type="button" className={`tabbtn${tab === "social" ? " active" : ""}`} onClick={() => setTab("social")}>Social calendar</button>
            </div>
            <div className="topactions">
              {tab === "content" && dirty ? <span className="dirtydot" title="Unsaved changes">● Unsaved</span> : null}
              <a href="/" target="_blank" rel="noopener noreferrer" className="mini">View site</a>
              {tab === "content" ? <button className="save" onClick={save} disabled={!dirty}>Save &amp; Deploy</button> : null}
              <button type="button" className="mini" onClick={signOut}>Sign out</button>
            </div>
          </div>

          {tab === "content" ? (
          <div className="launchers">
            <div className="arrange-launch">
              <b>🎨 Arrange the live site</b>
              <a href="/?edit" className="launchbtn primary">Homepage</a>
              <a href="/teardown?edit" className="launchbtn">Teardown page</a>
              <span className="muted">Drag pieces where you want, then hit <b>Copy layout</b> and send it to me to bake it in.</span>
            </div>
            <div className="arrange-launch">
              <b>📅 Social posting</b>
              <a href="/admin/social" className="launchbtn primary">Open publisher status</a>
              <span className="muted">Check what's scheduled, run a dry run, or post something now.</span>
            </div>
          </div>
          ) : null}

          {tab === "content" && status ? <div className="statusbar">{status}</div> : null}

          {tab === "social" ? (
            schedLoading || !schedule ? (
              <div className="loading">Loading social calendar…</div>
            ) : (
              <SocialCalendar schedule={schedule} setSchedule={setSchedule} onSave={() => saveSchedule(password, schedule)} />
            )
          ) : loading || !content ? (
            <div className="loading">Loading content…</div>
          ) : (
          <div className="contentlayout">
            <nav className="sectionnav">
              <input
                type="text"
                className="navsearch"
                placeholder="Find a section…"
                value={sectionQuery}
                onChange={(e) => setSectionQuery(e.target.value)}
              />
              {visibleKeys.map((key) => (
                <button
                  type="button"
                  key={key}
                  className={`navitem${activeSection === key ? " active" : ""}`}
                  onClick={() => setActiveSection(key)}
                >
                  <span className="navicon">{SECTION_ICONS[key] || "📄"}</span>
                  {prettyLabel(key)}
                </button>
              ))}
              {visibleKeys.length === 0 ? <div className="muted navempty">No sections match "{sectionQuery}"</div> : null}
            </nav>
            <div className="sectionmain">
              {activeSection && content[activeSection] !== undefined ? (
                <>
                  <div className="sectionheading">
                    <span className="navicon">{SECTION_ICONS[activeSection] || "📄"}</span>
                    {prettyLabel(activeSection)}
                  </div>
                  <Value keyName={activeSection} value={content[activeSection]} onChange={(v) => setSection(activeSection, v)} />
                </>
              ) : null}
              <div className="footersave">
                <button className="save" onClick={save} disabled={!dirty}>Save &amp; Deploy</button>
              </div>
            </div>
          </div>
          )}
        </div>
      )}
      <style>{SOCIAL_CSS}</style>
    </div>
  );
}

const ADMIN_CSS = `
.admin{font-family:'Inter',sans-serif;color:#413645;min-height:100vh;}
.admin .loading{min-height:60vh;display:flex;align-items:center;justify-content:center;}
.admin .logo{display:block;font-family:'Cinzel',serif;font-weight:600;color:#413645;letter-spacing:1px;}
.admin .logo span{color:#a85a76;}
.admin .muted{color:#6e6172;font-size:13px;}
.admin .err{color:#b5434f;font-size:13px;margin-top:6px;}
.loginwrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
.loginbox{background:rgba(255,255,255,.7);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.7);border-radius:20px;padding:36px 30px;width:100%;max-width:380px;display:grid;gap:14px;box-shadow:0 20px 60px rgba(65,54,69,.15);}
.loginbox .logo{font-size:20px;text-align:center;}
.rememberrow{font-size:13px;color:#6e6172;}
.admin input,.admin textarea{width:100%;padding:11px 13px;border:1px solid #e6ddec;border-radius:10px;font-family:inherit;font-size:14px;background:#fffdfb;color:#413645;}
.admin textarea{min-height:80px;resize:vertical;}
.save{background:#a85a76;color:#fff;border:none;padding:12px 22px;border-radius:100px;font-weight:600;font-size:14px;cursor:pointer;}
.save:disabled{opacity:.45;cursor:not-allowed;}
.save:hover{background:#8a4560;}
.topbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:rgba(244,239,234,.9);backdrop-filter:blur(12px);border-bottom:1px solid #e6ddec;}
.topbar .logo{font-size:18px;}
.topactions{display:flex;gap:12px;align-items:center;}
.tabs{display:flex;gap:6px;}
.tabbtn{background:none;border:1px solid transparent;padding:8px 14px;border-radius:100px;font-size:13px;font-weight:600;color:#6e6172;cursor:pointer;}
.tabbtn.active{background:#efe8f2;color:#8a4560;border-color:#e2d6ea;}
.statusbar{background:#efe8f2;color:#8a4560;padding:10px 24px;font-size:14px;}
.launchers{max-width:1040px;margin:18px auto 0;padding:0 20px;display:grid;gap:12px;}
.arrange-launch{background:#f4efea;border:1px solid #e4ddd2;border-radius:14px;padding:14px 18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.arrange-launch b{color:#413645;}
.arrange-launch .muted{color:#8a8779;font-size:13px;}
.launchbtn{text-decoration:none;padding:8px 16px;border-radius:100px;font-weight:600;font-size:14px;}
.launchbtn.primary{background:#413645;color:#fff;}
.launchbtn:not(.primary){background:#fff;color:#413645;border:1px solid #d8d1c4;padding:7px 14px;}
.dirtydot{color:#a85a76;font-size:12px;font-weight:700;letter-spacing:.03em;}
.contentlayout{max-width:1040px;margin:24px auto;padding:0 20px;display:flex;align-items:flex-start;gap:22px;}
.sectionnav{width:220px;flex-shrink:0;position:sticky;top:80px;display:flex;flex-direction:column;gap:4px;max-height:calc(100vh - 100px);overflow-y:auto;}
.navsearch{margin-bottom:8px;}
.navitem{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:1px solid transparent;padding:9px 12px;border-radius:10px;font-size:14px;font-weight:600;color:#6e6172;cursor:pointer;}
.navitem:hover{background:rgba(255,255,255,.6);}
.navitem.active{background:#fff;border-color:#e6ddec;color:#413645;box-shadow:0 2px 8px rgba(65,54,69,.08);}
.navicon{font-size:15px;}
.navempty{padding:8px 12px;}
.sectionmain{flex:1;min-width:0;background:rgba(255,255,255,.6);border:1px solid #e6ddec;border-radius:16px;padding:22px 26px 26px;}
.sectionheading{display:flex;align-items:center;gap:10px;font-family:'Cinzel',serif;font-size:19px;color:#413645;margin-bottom:6px;padding-bottom:14px;border-bottom:1px solid #e6ddec;}
.fld{margin:14px 0;}
.fld>label{display:block;font-size:12px;letter-spacing:.5px;text-transform:capitalize;color:#6e6172;margin-bottom:5px;font-weight:600;}
.switch{display:inline-flex;align-items:center;gap:8px;font-size:14px;}
.switch input{width:auto;}
.listrow{display:flex;gap:8px;margin-bottom:6px;}
.listrow input{flex:1;}
.mini{background:#efe8f2;color:#8a4560;border:none;padding:6px 12px;border-radius:100px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;}
.mini:hover{background:#e2d6ea;}
.mini.danger{background:#f6e3e6;color:#b5434f;}
.objcard{border:1px solid #e6ddec;border-radius:12px;padding:12px 14px;margin-bottom:12px;background:rgba(255,255,255,.5);}
.objtools{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#6e6172;margin-bottom:6px;}
.objtools>div{display:flex;gap:6px;}
.objnest{padding-left:6px;border-left:2px solid #e6ddec;}
.thumb{max-width:120px;border-radius:10px;margin-bottom:8px;display:block;}
.uprow{display:flex;gap:10px;align-items:center;margin-top:6px;font-size:13px;}
.footersave{margin-top:24px;padding-top:18px;border-top:1px solid #e6ddec;text-align:right;}
@media (max-width:768px){
  .contentlayout{flex-direction:column;padding:0 var(--gutter,16px);}
  .sectionnav{position:static;width:100%;flex-direction:row;flex-wrap:wrap;max-height:none;overflow-y:visible;}
  .navsearch{width:100%;flex-basis:100%;}
  .navitem{width:auto;}
  .sectionmain{padding:18px 18px 22px;width:100%;}
}
`;
