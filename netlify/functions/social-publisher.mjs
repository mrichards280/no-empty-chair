// Scheduled: every 10 minutes, publish any social posts that are due.
// Paused unless SOCIAL_PUBLISHER_ENABLED=true. See social/README.md.
import { getStore } from "@netlify/blobs";
import schedule from "../../public/social/schedule.json" with { type: "json" };
import { runTick, makeGraph, config as readConfig, checkManualReminders, postAutoComments, refreshAllStats, matchManualLinks } from "../lib/social-publisher.mjs";

const STATS_REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // only auto-refresh posts from the last week; older ones are a manual "Refresh stats" click away

export default async () => {
  const cfg = readConfig();
  const store = getStore({ name: "social-publisher", consistency: "strong" });
  const graph = makeGraph(cfg);
  const report = await runTick({ schedule, store, graph, cfg });
  await store.setJSON("_lastRun", report);
  console.log(JSON.stringify(report));
  try {
    const links = await matchManualLinks({ schedule, store, graph, cfg });
    if (links.matched.length) console.log("manual links found:", JSON.stringify(links.matched));
  } catch (err) {
    console.log("manual link check failed:", err.message);
  }
  try {
    const reminder = await checkManualReminders({ schedule, store, cfg });
    if (reminder.sent) console.log("manual reminder sent:", JSON.stringify(reminder.ids));
  } catch (err) {
    console.log("manual reminder check failed:", err.message);
  }
  try {
    const comments = await postAutoComments({ schedule, store, graph, cfg });
    if (comments.posted.length) console.log("auto comments:", JSON.stringify(comments.posted));
  } catch (err) {
    console.log("auto comment check failed:", err.message);
  }
  try {
    await refreshAllStats({ schedule, store, graph, maxAgeMs: STATS_REFRESH_MAX_AGE_MS });
  } catch (err) {
    console.log("stats refresh failed:", err.message);
  }
  return new Response("ok");
};

export const config = { schedule: "*/10 * * * *" };
