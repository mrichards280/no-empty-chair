import React, { useState } from "react";
import { ChairMark } from "./Site";

function encode(data) {
  return Object.keys(data)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(data[k]))
    .join("&");
}

const EMPTY = {
  name: "", salon: "", email: "", years: "", website: "",
  instagram: "", socials: "", stats: "", voice: "", issue: "",
  audience: "", vision: "", "bot-field": "",
};

// The $200 Glow-Up Teardown intake. Submits to the Netlify form "teardown"
// (exportable/private in the Netlify dashboard). Makayla confirms receipt,
// requests payment, then delivers the video breakdown.
export default function TeardownForm() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState(""); // "", sending, done, error
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form["bot-field"]) return;
    setStatus("sending");
    try {
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode({ "form-name": "teardown", ...form }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="teardown-page">
      <header className="tp-head">
        <a href="/" className="tp-logo">No Empty <span>Chair</span></a>
        <a href="/" className="tp-back">← Back to site</a>
      </header>

      <div className="tp-wrap">
        {status === "done" ? (
          <div className="tp-done">
            <div className="tp-mark"><ChairMark size={52} /></div>
            <h1>Got it. You're on my desk.</h1>
            <p>
              I'll confirm I received everything within a day, send you a simple payment link for the
              <b> $200 investment</b>, and then get to work on your teardown — a short, honest video breaking
              down the highest-impact changes to fill your chair. The $200 credits toward any package if you
              decide to build.
            </p>
            <a href="/" className="btn">Back to the site</a>
          </div>
        ) : (
          <>
            <div className="tp-intro">
              <div className="tp-mark"><ChairMark size={50} /></div>
              <div className="eyebrow" style={{ color: "var(--rose)", letterSpacing: 3, textTransform: "uppercase", fontSize: 12, marginBottom: 14 }}>The $200 Glow-Up Teardown</div>
              <h1>Let's find what's costing you bookings.</h1>
              <p>
                Fill this out — it takes about 5–7 minutes. I'll confirm I got it, send a payment link for the
                <b> $200 investment</b> (it credits toward any package), then deliver a short video breaking down
                the changes that'll move the needle first. The more you share, the sharper your teardown.
              </p>
            </div>

            <form className="tform" name="teardown" onSubmit={submit}>
              <input className="tp-hp" type="text" name="bot-field" tabIndex="-1" autoComplete="off" value={form["bot-field"]} onChange={set("bot-field")} />

              <div className="tp-row">
                <label>Your name<input required type="text" value={form.name} onChange={set("name")} /></label>
                <label>Salon / business name<input required type="text" value={form.salon} onChange={set("salon")} /></label>
              </div>
              <div className="tp-row">
                <label>Best email<input required type="email" value={form.email} onChange={set("email")} /></label>
                <label>How long in business?<input type="text" placeholder="e.g. 3 years, just started, since 2019" value={form.years} onChange={set("years")} /></label>
              </div>
              <div className="tp-row">
                <label>Website or Linktree<input type="text" placeholder="paste the link, or 'none yet'" value={form.website} onChange={set("website")} /></label>
                <label>Instagram handle<input type="text" placeholder="@yoursalon" value={form.instagram} onChange={set("instagram")} /></label>
              </div>
              <label>Other social handles<input type="text" placeholder="TikTok, Facebook, YouTube, Pinterest… whatever you're on" value={form.socials} onChange={set("socials")} /></label>

              <label>Your numbers, if you have them
                <span className="hint">Followers and reach/views over the last 30, 60, 90 days — and the past year if you can. Rough is fine; even screenshots you can send after.</span>
                <textarea value={form.stats} onChange={set("stats")} placeholder="e.g. IG: 2,400 followers · ~18k views/30d · ~50k/90d · reels do best…" />
              </label>

              <label>Your current voice / branding
                <span className="hint">Do you have a look or vibe already? Colors, fonts, how you talk to clients — or "totally starting over."</span>
                <textarea value={form.voice} onChange={set("voice")} />
              </label>

              <label>Your #1 problem with your brand right now
                <span className="hint">The one thing that bugs you most, or that you think is costing you clients.</span>
                <textarea required value={form.issue} onChange={set("issue")} />
              </label>

              <label>The audience you want to attract
                <span className="hint">Who's your dream client? Type of service, price point, the vibe of person you want in your chair.</span>
                <textarea value={form.audience} onChange={set("audience")} />
              </label>

              <label>Anything else — your vision
                <span className="hint">Optional. Where you want this to go, styles you love, or à la carte pieces you're curious about.</span>
                <textarea value={form.vision} onChange={set("vision")} />
              </label>

              <button className="btn" type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send my teardown request →"}
              </button>
              {status === "error" ? <div className="tp-err">Something went wrong — try again, or email info@noemptychair.co.</div> : null}
              <p className="tp-fine">No payment now. I'll confirm receipt and send a payment link before anything's charged.</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
