// Scheduled: every 10 minutes, publish any social posts that are due.
// Paused unless SOCIAL_PUBLISHER_ENABLED=true. See social/README.md.
import { getStore } from "@netlify/blobs";
import schedule from "../../public/social/schedule.json" with { type: "json" };
import { runTick, makeGraph, config as readConfig, checkManualReminders, postAutoComments, refreshAllStats, matchManualLinks } from "../lib/social-publisher.mjs";

// Stats are pulled on a sliding schedule (see statsIntervalMs): hourly for a post's first day,
// twice a day through day 7, daily through day 30. Ticks run every 10 minutes, so the pass
// only runs on the first tick of each hour. The Refresh stats button pulls everything on demand.

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
    if (new Date().getMinutes() < 10) {
      const res = await refreshAllStats({ schedule, store, graph, tiered: true });
      if (res.length) console.log("stats refreshed:", res.filter((r) => r.ok).length, "ok,", res.filter((r) => !r.ok).length, "failed");
    }
  } catch (err) {
    console.log("stats refresh failed:", err.message);
  }
  return new Response("ok");
};

export const config = { schedule: "*/10 * * * *" };
