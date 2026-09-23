import { useState, useEffect } from "react";

// Loads public/content.json and provides save/verify helpers that talk to the
// Netlify function. Mirrors the portfolio pattern: content.json is the single
// source of truth, owned by the admin panel.
export function useContent() {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    // cache-bust so the admin always sees the freshest saved copy
    fetch(`/content.json?t=${Date.now()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`content.json ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (alive) {
          setContent(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return { content, setContent, loading, error };
}

// Verify the admin password without saving (login check).
export async function verifyPassword(password) {
  try {
    const res = await fetch("/.netlify/functions/save-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, verifyOnly: true }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Save the full content object back to GitHub via the Netlify function.
export async function saveContent(password, content) {
  const res = await fetch("/.netlify/functions/save-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Save failed (${res.status})`);
  }
  return data;
}
