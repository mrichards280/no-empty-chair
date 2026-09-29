import { useState, useEffect } from "react";

// Loads public/social/hashtags.json (reusable hashtag sets for the social
// composer) and provides a save helper. Mirrors useSchedule.js.
export function useHashtags() {
  const [hashtags, setHashtags] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/social/hashtags.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : { sets: [] }))
      .then((data) => {
        if (alive) {
          setHashtags(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setHashtags({ sets: [] });
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return { hashtags, setHashtags, loading };
}

export async function saveHashtags(password, hashtags) {
  const res = await fetch("/.netlify/functions/save-hashtags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, hashtags }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
  return data;
}
