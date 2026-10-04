import React from "react";

// One save bar for every editor tab. It's the single, always-visible home for the primary
// action and tells you where you are in the flow: unsaved -> saving -> deploying -> live.
//
// props:
//   dirty, summary      unsaved state + short text like "2 edited · 1 added"
//   phase, message      idle | saving | deploying | live | slow | error | conflict
//   onSave, onDiscard   primary / secondary actions
//   onDismiss           closes a finished/error notice
//   conflict            { onMerge, onTakeTheirs } when the calendar changed elsewhere
const STEPS = ["Save", "Deploy", "Live"];

export default function SaveBar({ dirty, summary, phase = "idle", message, onSave, onDiscard, onDismiss, conflict, saveLabel = "Save & Deploy" }) {
  const busy = phase === "saving" || phase === "deploying";
  const show = dirty || phase !== "idle";
  if (!show) return null;

  const step = phase === "saving" ? 0 : phase === "deploying" ? 1 : phase === "live" || phase === "slow" ? 2 : -1;

  let body;
  if (phase === "conflict" && conflict) {
    body = (
      <>
        <div className="sb-text"><b>Changed somewhere else.</b> {message} Your edits are still here.</div>
        <div className="sb-actions">
          <button type="button" className="sb-btn" onClick={conflict.onTakeTheirs}>Use the newer version</button>
          <button type="button" className="sb-btn primary" onClick={conflict.onMerge}>Keep my changes + merge</button>
        </div>
      </>
    );
  } else if (phase === "error") {
    body = (
      <>
        <div className="sb-text sb-err" role="alert"><b>Couldn't save.</b> {message} <span className="sb-sub">Nothing was lost.</span></div>
        <div className="sb-actions">
          <button type="button" className="sb-btn" onClick={onDismiss}>Dismiss</button>
          <button type="button" className="sb-btn primary" onClick={onSave}>Try again</button>
        </div>
      </>
    );
  } else if (phase === "saved") {
    body = (
      <>
        <div className="sb-text" role="status" aria-live="polite"><span className="sb-check" aria-hidden="true">✓</span><b>Saved.</b> <span className="sb-msg">{message}</span></div>
        <div className="sb-actions"><button type="button" className="sb-btn" onClick={onDismiss}>Done</button></div>
      </>
    );
  } else if (busy || phase === "live" || phase === "slow") {
    body = (
      <>
        <div className="sb-text" role="status" aria-live="polite">
          <ol className="sb-steps" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? "done" : i === step ? (phase === "live" || phase === "slow" ? "done" : "now") : ""}>
                <span className="sb-dot">{i < step || (i === step && (phase === "live" || phase === "slow")) ? "✓" : ""}</span>{s}
              </li>
            ))}
          </ol>
          <span className="sb-msg">{message}</span>
        </div>
        {!busy ? <div className="sb-actions"><button type="button" className="sb-btn" onClick={onDismiss}>Done</button></div> : null}
      </>
    );
  } else {
    body = (
      <>
        <div className="sb-text"><span className="sb-pulse" aria-hidden="true" /><b>Unsaved changes</b>{summary ? <span className="sb-sub"> · {summary}</span> : null}</div>
        <div className="sb-actions">
          <button type="button" className="sb-btn" onClick={onDiscard}>Discard</button>
          <button type="button" className="sb-btn primary" onClick={onSave}>{saveLabel}</button>
        </div>
      </>
    );
  }

  return <div className={`savebar sb-${phase}`}>{body}</div>;
}

export const SAVEBAR_CSS = `
.savebar{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:90;width:min(720px,calc(100vw - 24px));display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:12px 14px 12px 20px;border-radius:20px;background:rgba(255,253,251,.92);backdrop-filter:blur(18px) saturate(160%);-webkit-backdrop-filter:blur(18px) saturate(160%);border:1px solid #e6ddec;box-shadow:0 18px 50px rgba(65,54,69,.22);animation:sbIn .22s ease-out;}
@keyframes sbIn{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
.sb-text{font-size:14px;color:#413645;display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;flex:1 1 240px;}
.sb-sub{color:#6e6172;font-weight:400;}
.sb-err{color:#8c2f2f;}
.sb-pulse{width:9px;height:9px;border-radius:50%;background:#a85a76;flex-shrink:0;animation:sbPulse 1.6s ease-in-out infinite;}
@keyframes sbPulse{0%,100%{box-shadow:0 0 0 0 rgba(168,90,118,.5)}50%{box-shadow:0 0 0 7px rgba(168,90,118,0)}}
.sb-actions{display:flex;gap:8px;flex-shrink:0;margin-left:auto;}
.sb-btn{font:inherit;font-size:14px;font-weight:600;min-height:44px;padding:0 20px;border-radius:100px;border:1px solid #e6ddec;background:#fff;color:#413645;cursor:pointer;transition:background .15s,transform .1s;}
.sb-btn:hover{background:#f8f4fb;}
.sb-btn:active{transform:scale(.97);}
.sb-btn.primary{background:#a85a76;border-color:#a85a76;color:#fff;box-shadow:0 6px 16px rgba(168,90,118,.32);}
.sb-btn.primary:hover{background:#8a4560;}
.sb-steps{display:flex;gap:6px;list-style:none;margin:0;padding:0;align-items:center;}
.sb-steps li{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;letter-spacing:.03em;color:#8a7f86;}
.sb-steps li+li::before{content:"";width:18px;height:2px;background:#e6ddec;border-radius:2px;margin-right:2px;}
.sb-steps li.done{color:#1d6b3a;}
.sb-steps li.done+li::before{background:#9fd3b2;}
.sb-steps li.now{color:#8a4560;}
.sb-dot{width:18px;height:18px;border-radius:50%;border:2px solid #e6ddec;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#fff;}
.sb-steps li.done .sb-dot{background:#1d6b3a;border-color:#1d6b3a;}
.sb-steps li.now .sb-dot{border-color:#a85a76 #a85a76 transparent transparent;animation:sbSpin .7s linear infinite;}
@keyframes sbSpin{to{transform:rotate(360deg)}}
.sb-msg{color:#6e6172;font-size:13px;}
.sb-check{width:22px;height:22px;border-radius:50%;background:#1d6b3a;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;}
.sb-saved,.sb-live{background:rgba(238,248,242,.95);border-color:#bfe6cf;}
.sb-error,.sb-conflict{border-color:#e9c4c4;background:rgba(255,247,246,.96);}
@media (max-width:560px){
  .savebar{bottom:calc(10px + env(safe-area-inset-bottom));padding:12px;border-radius:18px;}
  .sb-actions{width:100%;}
  .sb-btn{flex:1;}
}
@media (prefers-reduced-motion:reduce){.savebar,.sb-pulse,.sb-steps li.now .sb-dot{animation:none}}
`;
