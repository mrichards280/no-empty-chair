import React, { useState } from "react";
import { useContent, verifyPassword, saveContent } from "../hooks/useContent";
import { uploadImage, cloudinaryConfigured } from "../lib/cloudinary";

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
      <label>{label}</label>
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
      <label>{label}</label>
      {(list || []).map((item, i) => (
        <div className="listrow" key={i}>
          <input type="text" value={item} onChange={(e) => set(i, e.target.value)} />
          <button type="button" className="mini danger" onClick={() => del(i)}>✕</button>
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
        <label>{keyName}</label>
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
          <label>{keyName}</label>
          <textarea value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    return (
      <div className="fld">
        <label>{keyName}</label>
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
        <label>{keyName}</label>
        {value.map((item, i) => (
          <div className="objcard" key={i}>
            <div className="objtools">
              <span>#{i + 1}</span>
              <div>
                <button type="button" className="mini" onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="mini" onClick={() => move(i, 1)}>↓</button>
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

/* ---------- main admin ---------- */
export default function Admin() {
  const { content, setContent, loading } = useContent();
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authErr, setAuthErr] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState({});

  const login = async (e) => {
    e.preventDefault();
    setAuthErr("");
    const ok = await verifyPassword(password);
    if (ok) setAuthed(true);
    else setAuthErr("Wrong password, or the save function isn't configured yet.");
  };

  const save = async () => {
    setStatus("Saving & deploying…");
    try {
      await saveContent(password, content);
      setStatus("Saved. Your site will redeploy in about a minute.");
    } catch (ex) {
      setStatus("Error: " + ex.message);
    }
  };

  const setSection = (key, val) => setContent({ ...content, [key]: val });

  return (
    <div className="admin">
      <style>{ADMIN_CSS}</style>

      {!authed ? (
        <div className="loginwrap">
          <form className="loginbox" onSubmit={login}>
            <div className="logo">No Empty <span>Chair</span> · Admin</div>
            <p className="muted">Sign in to edit your site content.</p>
            <input type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="save" type="submit">Sign in</button>
            {authErr ? <div className="err">{authErr}</div> : null}
          </form>
        </div>
      ) : loading || !content ? (
        <div className="loading">Loading content…</div>
      ) : (
        <div className="editor">
          <div className="topbar">
            <div className="logo">No Empty <span>Chair</span> · Editor</div>
            <div className="topactions">
              <a href="/" target="_blank" rel="noopener noreferrer" className="mini">View site</a>
              <button className="save" onClick={save}>Save &amp; Deploy</button>
            </div>
          </div>
          {status ? <div className="statusbar">{status}</div> : null}
          <div className="sections">
            {Object.keys(content).map((key) => (
              <div className="section" key={key}>
                <button type="button" className="sectionhead" onClick={() => setOpen({ ...open, [key]: !open[key] })}>
                  <span>{key}</span>
                  <span>{open[key] ? "–" : "+"}</span>
                </button>
                {open[key] ? (
                  <div className="sectionbody">
                    <Value keyName={key} value={content[key]} onChange={(v) => setSection(key, v)} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="footersave">
            <button className="save" onClick={save}>Save &amp; Deploy</button>
          </div>
        </div>
      )}
    </div>
  );
}

const ADMIN_CSS = `
.admin{font-family:'Inter',sans-serif;color:#413645;min-height:100vh;}
.admin .loading{min-height:60vh;display:flex;align-items:center;justify-content:center;}
.admin .logo{font-family:'Cinzel',serif;font-weight:600;color:#413645;letter-spacing:1px;}
.admin .logo span{color:#a85a76;}
.admin .muted{color:#6e6172;font-size:13px;}
.admin .err{color:#b5434f;font-size:13px;margin-top:6px;}
.loginwrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
.loginbox{background:rgba(255,255,255,.7);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.7);border-radius:20px;padding:36px 30px;width:100%;max-width:380px;display:grid;gap:14px;box-shadow:0 20px 60px rgba(65,54,69,.15);}
.loginbox .logo{font-size:20px;text-align:center;}
.admin input,.admin textarea{width:100%;padding:11px 13px;border:1px solid #e6ddec;border-radius:10px;font-family:inherit;font-size:14px;background:#fffdfb;color:#413645;}
.admin textarea{min-height:80px;resize:vertical;}
.save{background:#a85a76;color:#fff;border:none;padding:12px 22px;border-radius:100px;font-weight:600;font-size:14px;cursor:pointer;}
.save:hover{background:#8a4560;}
.topbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:rgba(244,239,234,.9);backdrop-filter:blur(12px);border-bottom:1px solid #e6ddec;}
.topbar .logo{font-size:18px;}
.topactions{display:flex;gap:12px;align-items:center;}
.statusbar{background:#efe8f2;color:#8a4560;padding:10px 24px;font-size:14px;}
.sections{max-width:820px;margin:24px auto;padding:0 20px;display:grid;gap:12px;}
.section{border:1px solid #e6ddec;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.6);}
.sectionhead{width:100%;display:flex;justify-content:space-between;align-items:center;padding:15px 20px;background:none;border:none;font-family:'Cinzel',serif;font-size:17px;color:#413645;cursor:pointer;text-transform:capitalize;}
.sectionbody{padding:8px 20px 20px;}
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
.footersave{max-width:820px;margin:0 auto 60px;padding:0 20px;text-align:right;}
`;
