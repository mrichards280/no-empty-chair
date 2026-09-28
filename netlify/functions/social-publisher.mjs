// Scheduled: every 10 minutes, publish any social posts that are due.
// Paused unless SOCIAL_PUBLISHER_ENABLED=true. See social/README.md.
import { getStore } from "@netlify/blobs";
import schedule from "../../public/social/schedule.json" with { type: "json" };
import { runTick, makeGraph, config as readConfig } from "../lib/social-publisher.mjs";

export default async () => {
  const cfg = readConfig();
  const store = getStore({ name: "social-publisher", consistency: "strong" });
  const report = await runTick({ schedule, store, graph: makeGraph(cfg), cfg });
  await store.setJSON("_lastRun", report);
  console.log(JSON.stringify(report));
  return new Response("ok");
};

export const config = { schedule: "*/10 * * * *" };
