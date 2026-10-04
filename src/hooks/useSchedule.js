import { useState, useEffect, useRef, useCallback } from "react";

// Loads public/social/schedule.json and owns everything about saving it: unsaved-change
// tracking, a local draft that survives a refresh, conflict detection against GitHub, and
// deploy progress after a save. Mirrors useContent.js's content.json pattern for loading.

const DRAFT_KEY = "necSocialDraft";

async function hashOf(obj) {
  try {
    const buf = new TextEncoder().encode(JSON.stringify(obj));
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // insecure context: conflict checking is skipped, saving still works
  }
}

const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } };
const writeDraft = (d) => { try { d ? localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) : localStorage.removeItem(DRAFT_KEY); } catch {} };

// Plain-language summary of what differs between two schedules (by post id).
export function diffSchedules(base, mine) {
  const b = new Map((base?.posts || []).map((p) => [p.id, JSON.stringify(p)]));
  const m = new Map((mine?.posts || []).map((p) => [p.id, JSON.stringify(p)]));
  let added = 0, edited = 0, removed = 0;
  for (const [id, json] of m) { if (!b.has(id)) added++; else if (b.get(id) !== json) edited++; }
  for (const id of b.keys()) if (!m.has(id)) removed++;
  return { added, edited, removed, total: added + edited + removed };
}

// Three-way merge by post id: posts you didn't touch take the newer copy, posts you did
// touch keep your version.
function mergeSchedules(base, mine, theirs) {
  const key = (s) => new Map((s?.posts || []).map((p) => [p.id, p]));
  const B = key(base), M = key(mine), T = key(theirs);
  const out = new Map();
  for (const [id, p] of T) out.set(id, p);
  for (const [id, p] of M) {
    const untouched = B.has(id) && JSON.stringify(B.get(id)) === JSON.stringify(p);
    if (!untouched) out.set(id, p);
  }
  for (const id of B.keys()) {
    if (!M.has(id) && JSON.stringify(B.get(id)) === JSON.stringify(T.get(id))) out.delete(id); // you deleted it, nobody else touched it
  }
  const posts = [...out.values()].sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));
  return { ...theirs, posts };
}

export function useSchedule() {
  const [schedule, setSchedule] = useState(null);
  const [savedJson, setSavedJson] = useState(null);   // last loaded/saved copy, as a string
  const [baseHash, setBaseHash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);           // unsaved edits found from a previous visit
  const [phase, setPhase] = useState("idle");         // idle | saving | deploying | live | slow | error | conflict
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(null);     // { currentSchedule, currentHash }
  const alive = useRef(true);
  const pollRef = useRef(0);

  useEffect(() => {
    alive.current = true;
    fetch(`/social/schedule.json?t=${Date.now()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`schedule.json ${r.status}`);
        return r.json();
      })
      .then(async (data) => {
        if (!alive.current) return;
        const hash = await hashOf(data);
        setSchedule(data);
        setSavedJson(JSON.stringify(data));
        setBaseHash(hash);
        setLoading(false);
        const d = readDraft();
        if (d?.schedule && JSON.stringify(d.schedule) !== JSON.stringify(data)) setDraft(d);
        else writeDraft(null);
      })
      .catch((e) => {
        if (alive.current) { setError(e.message); setLoading(false); }
      });
    return () => { alive.current = false; clearTimeout(pollRef.current); };
  }, []);

  const saved = savedJson ? JSON.parse(savedJson) : null;
  const dirty = savedJson !== null && schedule !== null && JSON.stringify(schedule) !== savedJson;
  const changes = dirty ? diffSchedules(saved, schedule) : { added: 0, edited: 0, removed: 0, total: 0 };

  // Keep a local copy of unsaved edits so a refresh, crash or closed tab never loses them.
  useEffect(() => {
    if (savedJson === null || draft) return; // don't overwrite a draft that's waiting to be restored
    if (!dirty) { writeDraft(null); return; }
    const t = setTimeout(() => writeDraft({ schedule, baseHash, at: Date.now() }), 500);
    return () => clearTimeout(t);
  }, [schedule, dirty, baseHash, savedJson, draft]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const restoreDraft = useCallback(() => {
    if (!draft) return;
    setSchedule(draft.schedule);
    setDraft(null);
  }, [draft]);
  const dismissDraft = useCallback(() => { writeDraft(null); setDraft(null); }, []);

  const discard = useCallback(() => {
    if (savedJson) setSchedule(JSON.parse(savedJson));
    writeDraft(null);
    setPhase("idle");
    setMessage("");
    setConflict(null);
  }, [savedJson]);

  // After a save, GitHub redeploys the site. Watch the live file until it matches what we
  // sent so "saved" can honestly become "live".
  const watchDeploy = useCallback((hash) => {
    clearTimeout(pollRef.current);
    let tries = 0;
    const tick = async () => {
      if (!alive.current) return;
      tries++;
      try {
        const r = await fetch(`/social/schedule.json?t=${Date.now()}`, { cache: "no-store" });
        if (r.ok && (await hashOf(await r.json())) === hash) {
          setPhase("live");
          setMessage("Live. The calendar and the auto-poster are using your changes.");
          pollRef.current = setTimeout(() => alive.current && setPhase((p) => (p === "live" ? "idle" : p)), 8000);
          return;
        }
      } catch {}
      if (tries >= 40) {
        setPhase("slow");
        setMessage("Saved. The deploy is taking longer than usual; it will go live on its own.");
        return;
      }
      pollRef.current = setTimeout(tick, 5000);
    };
    pollRef.current = setTimeout(tick, 4000);
  }, []);

  const save = useCallback(async (password) => {
    if (!schedule) return;
    const sent = schedule;
    setPhase("saving");
    setMessage("Saving your changes…");
    try {
      const res = await fetch("/.netlify/functions/save-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, schedule: sent, baseHash }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.currentSchedule) {
        setConflict({ currentSchedule: data.currentSchedule, currentHash: data.currentHash });
        setPhase("conflict");
        setMessage("This calendar was changed somewhere else since you opened it.");
        return;
      }
      if (!res.ok) {
        const detail = data.problems ? " " + data.problems.map((p) => `${p.id}: ${p.errors.join("; ")}`).join(" | ") : "";
        setPhase("error");
        setMessage((data.error || `Save failed (${res.status})`) + detail);
        return;
      }
      const hash = data.hash || (await hashOf(sent));
      setSavedJson(JSON.stringify(sent));
      setBaseHash(hash);
      writeDraft(null);
      setPhase("deploying");
      setMessage("Saved. Deploying to the live site…");
      watchDeploy(hash);
    } catch (e) {
      setPhase("error");
      setMessage("Couldn't reach the server. Your changes are safe here; try again. (" + e.message + ")");
    }
  }, [schedule, baseHash, watchDeploy]);

  // Conflict resolutions
  const mergeConflict = useCallback(() => {
    if (!conflict) return;
    const merged = mergeSchedules(saved, schedule, conflict.currentSchedule);
    setSchedule(merged);
    setSavedJson(JSON.stringify(conflict.currentSchedule));
    setBaseHash(conflict.currentHash);
    setConflict(null);
    setPhase("idle");
    setMessage("");
  }, [conflict, saved, schedule]);
  const takeTheirs = useCallback(() => {
    if (!conflict) return;
    setSchedule(conflict.currentSchedule);
    setSavedJson(JSON.stringify(conflict.currentSchedule));
    setBaseHash(conflict.currentHash);
    writeDraft(null);
    setConflict(null);
    setPhase("idle");
    setMessage("");
  }, [conflict]);

  const clearNotice = useCallback(() => { setPhase("idle"); setMessage(""); }, []);

  return {
    schedule, setSchedule, loading, error,
    dirty, changes, phase, message, conflict,
    draft, restoreDraft, dismissDraft,
    save, discard, mergeConflict, takeTheirs, clearNotice,
  };
}
