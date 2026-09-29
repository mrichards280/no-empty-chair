import { useState, useEffect } from "react";

// Loads public/social/schedule.json and provides a save helper that talks to
// the Netlify function. Mirrors useContent.js's content.json pattern exactly.
export function useSchedule() {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`/social/schedule.json?t=${Date.now()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`schedule.json ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (alive) {
          setSchedule(data);
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

  return { schedule, setSchedule, loading, error };
}

// Save the full schedule object back to GitHub via the Netlify function.
// Throws with a message from the server on failure, including schedule
// validation problems (each { id, errors }) attached as err.problems.
export async function saveSchedule(password, schedule) {
  const res = await fetch("/.netlify/functions/save-schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, schedule }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Save failed (${res.status})`);
    err.problems = data.problems;
    throw err;
  }
  return data;
}
