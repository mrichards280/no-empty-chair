import React, { useEffect, useState, useCallback, useRef } from "react";
import { ChairMark } from "./ChairMark";

// URL-encode a flat object for Netlify Forms submission.
function encode(data) {
  return Object.keys(data)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(data[k]))
    .join("&");
}

const SEEN_KEY = "nec_radar_seen";

function getSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function setSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

// Lead-capture popup: "Are you on our radar yet?" Saves to Netlify Forms
// (form name "leads"), which you can export as a CSV from the Netlify dashboard.
export default function RadarModal({ radar }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ business: "", instagram: "", contact: "", "bot-field": "" });
  const [status, setStatus] = useState(""); // "", "sending", "done", "error"

  const enabled = radar && radar.enabled !== false;

  // Auto-open once, after a delay, unless the visitor has already seen it.
  useEffect(() => {
    if (!enabled) return;
    if (getSeen()) return;
    const secs = Number(radar.delaySeconds) > 0 ? Number(radar.delaySeconds) : 8;
    const t = setTimeout(() => setOpen(true), secs * 1000);
    return () => clearTimeout(t);
  }, [enabled, radar]);

  const close = useCallback(() => {
    setOpen(false);
    setSeen();
  }, []);

  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  // Escape closes the modal; Tab is trapped inside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = dialogRef.current.querySelectorAll(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.prototype.filter.call(items, (el) => !el.disabled && el.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Move focus into the dialog on open, and hand it back on close.
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      const t = setTimeout(() => {
        const el = dialogRef.current && dialogRef.current.querySelector("input, button");
        if (el) el.focus();
      }, 0);
      return () => clearTimeout(t);
    }
    if (returnFocusRef.current && returnFocusRef.current.focus) {
      returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  if (!enabled) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (form["bot-field"]) return; // honeypot tripped
    setStatus("sending");
    try {
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode({ "form-name": "leads", ...form }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
      setSeen();
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      {/* Floating re-open tab */}
      {!open ? (
        <button className="radar-fab" type="button" onClick={() => setOpen(true)} aria-label={radar.reopenLabel || "On our radar?"}>
          <span className="radar-fab-eyes" aria-hidden="true">👀</span>
          <span className="radar-fab-text">{radar.reopenLabel || "On our radar?"}</span>
        </button>
      ) : null}

      {open ? (
        <div className="radar-overlay" onClick={close} role="dialog" aria-modal="true" aria-label={radar.headline}>
          <div className="radar-modal glass" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
            <button className="radar-close" type="button" onClick={close} aria-label="Close">×</button>

            {status === "done" ? (
              <div className="radar-done">
                <div className="radar-eyes" aria-hidden="true">👀</div>
                <h3>{radar.successHeadline || "Oh, we've noticed you."}</h3>
                <p>{radar.successBody || "You're officially on our radar. We'll be in touch soon."}</p>
                <button className="btn" type="button" onClick={close}>Close</button>
              </div>
            ) : (
              <>
                <div className="radar-mark"><ChairMark size={44} /></div>
                {radar.eyebrow ? <div className="radar-eyebrow">{radar.eyebrow}</div> : null}
                <h3 className="radar-headline">{radar.headline} <span aria-hidden="true">👀</span></h3>
                <p className="radar-sub">{radar.sub}</p>

                <form className="radar-form" name="leads" onSubmit={submit}>
                  {/* Honeypot field, visually hidden */}
                  <input
                    className="radar-hp"
                    type="text"
                    name="bot-field"
                    tabIndex="-1"
                    autoComplete="off"
                    value={form["bot-field"]}
                    onChange={(e) => setForm({ ...form, "bot-field": e.target.value })}
                  />
                  <input
                    required
                    type="text"
                    placeholder={radar.businessLabel || "Salon / business name"}
                    value={form.business}
                    onChange={(e) => setForm({ ...form, business: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder={radar.instagramLabel || "Instagram handle"}
                    value={form.instagram}
                    onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                  />
                  <input
                    required
                    type="text"
                    placeholder={radar.contactLabel || "Best email or phone"}
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  />
                  <button className="btn" type="submit" disabled={status === "sending"}>
                    {status === "sending" ? "Checking…" : radar.button || "Check now"}
                  </button>
                  {status === "error" ? (
                    <div className="radar-err">Hmm, that didn't go through. Try again in a moment.</div>
                  ) : null}
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
