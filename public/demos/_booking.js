/* No Empty Chair — shared live-booking overlay for demo sites.
   Configure per demo with window.NEC_BOOKING before this script loads:
   {
     brand:"POPPI", markSrc:"/demos/_nec-mark.svg",
     theme:{accent,accentSoft,onAccent,surface,bg,ink},
     serviceLabel:"main service", enhanceLabel:"add any enhancements",
     services:[{name,price,dur,p}],            // p = numeric price for totals
     enhancements:[{name,price,p}],            // optional add-on upgrades
     deposit:"$20", address:"...", confirmVerb:"booked"
   }
*/
(function () {
  var CFG = window.NEC_BOOKING || {};
  var T = CFG.theme || {};
  var services = CFG.services || [];
  var enh = CFG.enhancements || [];
  var DAYNAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SLOTS = ["10:00a", "11:30a", "1:00p", "2:30p", "4:00p", "5:30p", "7:00p"];

  var days = [];
  var baseDate = new Date();
  for (var i = 0; i < 8; i++) days.push(new Date(baseDate.getTime() + i * 86400000));
  function dayLabel(d, i) { if (i === 0) return "Today"; if (i === 1) return "Tmrw"; return DAYNAMES[d.getDay()] + " " + d.getDate(); }
  function slotTaken(dayIdx, slotIdx) { return ((dayIdx * 3 + slotIdx * 5) % 7) < 2; }

  // step flow: service -> [enhance] -> when -> details -> done
  var STEPS = ["service"];
  if (enh.length) STEPS.push("enhance");
  STEPS.push("when", "details", "done");
  var LASTBAR = STEPS.length - 1; // exclude "done" from progress fill count

  var markSrc = CFG.markSrc || "/demos/_nec-mark.svg";
  function markImg(px) { return '<img src="' + markSrc + '" alt="" width="' + Math.round(px * 0.79) + '" height="' + px + '" style="display:inline-block;vertical-align:middle">'; }

  var state = { step: 0, service: null, enh: [], dayIdx: 0, slot: null, name: "", phone: "" };

  var overlay = document.createElement("div");
  overlay.className = "nec-bk-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Book an appointment");
  if (T.accent) overlay.style.setProperty("--bk-accent", T.accent);
  if (T.accentSoft) overlay.style.setProperty("--bk-accent-soft", T.accentSoft);
  if (T.onAccent) overlay.style.setProperty("--bk-on-accent", T.onAccent);
  if (T.surface) overlay.style.setProperty("--bk-surface", T.surface);
  if (T.bg) overlay.style.setProperty("--bk-bg", T.bg);
  if (T.ink) overlay.style.setProperty("--bk-ink", T.ink);
  overlay.innerHTML = '<div class="nec-bk-scrim" data-close></div><div class="nec-bk-sheet"></div>';
  document.body.appendChild(overlay);
  var sheet = overlay.querySelector(".nec-bk-sheet");

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function money(n) { return "$" + n; }
  function total() {
    var t = services[state.service] ? (services[state.service].p || 0) : 0;
    state.enh.forEach(function (i) { t += enh[i].p || 0; });
    return t;
  }

  function open() { state = { step: 0, service: null, enh: [], dayIdx: 0, slot: null, name: "", phone: "" }; render(); overlay.classList.add("open"); document.body.style.overflow = "hidden"; }
  function close() { overlay.classList.remove("open"); document.body.style.overflow = ""; }
  function go(dir) { state.step = Math.max(0, Math.min(STEPS.length - 1, state.step + dir)); render(); }

  function steps() { var s = ""; for (var i = 0; i < LASTBAR; i++) s += '<i class="' + (i <= state.step ? "on" : "") + '"></i>'; return '<div class="nec-bk-steps">' + s + "</div>"; }
  function head() { return '<div class="nec-bk-head"><div class="nec-bk-brand">' + markImg(17) + " " + esc(CFG.brand || "Book") + '</div><button class="nec-bk-x" data-close aria-label="Close">&times;</button></div>'; }
  function signature() { return '<div class="nec-bk-fine">' + markImg(14) + " Booking flow designed by No Empty Chair</div>"; }

  function render() {
    var name = STEPS[state.step];
    var html = head() + steps();
    if (name === "service") {
      html += '<div class="nec-bk-h">Choose your ' + esc(CFG.serviceLabel || "service") + '</div><div class="nec-bk-sub">Start with the main service — you can add upgrades next.</div>';
      services.forEach(function (sv, i) {
        html += '<button class="nec-bk-opt ' + (state.service === i ? "sel" : "") + '" data-svc="' + i + '"><span><b>' + esc(sv.name) + "</b>" + (sv.dur ? "<small>" + esc(sv.dur) + "</small>" : "") + '</span><span class="pr">' + esc(sv.price) + "</span></button>";
      });
      html += '<button class="nec-bk-cta" data-next ' + (state.service === null ? "disabled" : "") + ">Continue →</button>";
    } else if (name === "enhance") {
      html += '<div class="nec-bk-h">' + esc(CFG.enhanceLabel || "Add enhancements") + '</div><div class="nec-bk-sub">Optional upgrades on top of your ' + esc(services[state.service].name) + ". Tap any that apply.</div>";
      enh.forEach(function (e, i) {
        var on = state.enh.indexOf(i) > -1;
        html += '<button class="nec-bk-opt ' + (on ? "sel" : "") + '" data-enh="' + i + '"><span><b>' + esc(e.name) + '</b></span><span class="pr">' + (on ? "✓ " : "") + esc(e.price) + "</span></button>";
      });
      html += '<div class="nec-bk-sum"><div><span>Running total</span><span>' + money(total()) + "</span></div></div>";
      html += '<button class="nec-bk-cta" data-next>Choose a time →</button>';
      html += '<button class="nec-bk-back" data-back>← Back</button>';
    } else if (name === "when") {
      var sv = services[state.service];
      html += '<div class="nec-bk-h">Pick a time</div><div class="nec-bk-sub">' + esc(sv.name) + " · " + money(total()) + '</div>';
      html += '<div class="nec-bk-daylab">Day</div><div class="nec-bk-chips">';
      days.forEach(function (d, i) { html += '<button class="nec-bk-chip ' + (state.dayIdx === i ? "sel" : "") + '" data-day="' + i + '">' + dayLabel(d, i) + "</button>"; });
      html += "</div>";
      var d0 = days[state.dayIdx];
      html += '<div class="nec-bk-daylab">' + DAYNAMES[d0.getDay()] + ", " + MONTHS[d0.getMonth()] + " " + d0.getDate() + '</div><div class="nec-bk-chips">';
      SLOTS.forEach(function (t, si) { var taken = slotTaken(state.dayIdx, si); html += '<button class="nec-bk-chip ' + (state.slot === t ? "sel" : "") + '" data-slot="' + t + '" ' + (taken ? "disabled" : "") + ">" + t + "</button>"; });
      html += "</div>";
      html += '<button class="nec-bk-cta" data-next ' + (state.slot === null ? "disabled" : "") + ">Continue →</button>";
      html += '<button class="nec-bk-back" data-back>← Back</button>';
    } else if (name === "details") {
      var d2 = days[state.dayIdx];
      html += '<div class="nec-bk-h">Almost done.</div><div class="nec-bk-sub">Who\'s the appointment for?</div>';
      html += '<div class="nec-bk-sum"><div><span>Service</span><span>' + esc(services[state.service].name) + "</span></div>";
      if (state.enh.length) html += '<div><span>Upgrades</span><span>' + state.enh.map(function (i) { return esc(enh[i].name); }).join(", ") + "</span></div>";
      html += '<div><span>When</span><span>' + dayLabel(d2, state.dayIdx) + " · " + state.slot + "</span></div><div><span>Total</span><span>" + money(total()) + "</span></div></div>";
      html += '<input class="nec-bk-field" data-name placeholder="Your name" value="' + esc(state.name) + '" autocomplete="name">';
      html += '<input class="nec-bk-field" data-phone placeholder="Mobile number" value="' + esc(state.phone) + '" inputmode="tel" autocomplete="tel">';
      html += '<button class="nec-bk-cta" data-confirm ' + (state.name && state.phone ? "" : "disabled") + ">Confirm" + (CFG.deposit ? " · " + esc(CFG.deposit) + " deposit" : "") + "</button>";
      html += '<button class="nec-bk-back" data-back>← Back</button>';
    } else { // done
      var d3 = days[state.dayIdx];
      var code = "NEC-" + (1000 + ((state.dayIdx * 31 + SLOTS.indexOf(state.slot) * 7 + state.service * 13) % 8999));
      html += '<div class="nec-bk-center"><div class="nec-bk-check">✓</div><div class="nec-bk-h">You\'re ' + esc(CFG.confirmVerb || "booked") + ", " + esc(state.name.split(" ")[0] || "") + '!</div><div class="nec-bk-sub">A confirmation text is on its way.</div></div>';
      html += '<div class="nec-bk-sum"><div><span>Service</span><span>' + esc(services[state.service].name) + "</span></div>";
      if (state.enh.length) html += '<div><span>Upgrades</span><span>' + state.enh.map(function (i) { return esc(enh[i].name); }).join(", ") + "</span></div>";
      html += '<div><span>When</span><span>' + dayLabel(d3, state.dayIdx) + " · " + state.slot + "</span></div>" + (CFG.address ? '<div><span>Where</span><span>' + esc(CFG.address) + "</span></div>" : "") + '<div><span>Total</span><span>' + money(total()) + '</span></div><div><span>Confirmation</span><span>' + code + "</span></div></div>";
      html += '<button class="nec-bk-cta" data-close>Done</button>';
    }
    html += signature();
    sheet.innerHTML = html;
  }

  overlay.addEventListener("click", function (e) {
    var t = e.target.closest("[data-close],[data-next],[data-back],[data-svc],[data-enh],[data-day],[data-slot],[data-confirm]");
    if (!t) return;
    if (t.hasAttribute("data-close")) return close();
    if (t.hasAttribute("data-svc")) { state.service = +t.getAttribute("data-svc"); return render(); }
    if (t.hasAttribute("data-enh")) { var i = +t.getAttribute("data-enh"), k = state.enh.indexOf(i); if (k > -1) state.enh.splice(k, 1); else state.enh.push(i); return render(); }
    if (t.hasAttribute("data-day")) { state.dayIdx = +t.getAttribute("data-day"); state.slot = null; return render(); }
    if (t.hasAttribute("data-slot")) { if (t.disabled) return; state.slot = t.getAttribute("data-slot"); return render(); }
    if (t.hasAttribute("data-back")) return go(-1);
    if (t.hasAttribute("data-next")) { if (t.disabled) return; return go(1); }
    if (t.hasAttribute("data-confirm")) { if (t.disabled) return; state.step = STEPS.indexOf("done"); return render(); }
  });
  sheet.addEventListener("input", function (e) {
    if (e.target.hasAttribute("data-name")) state.name = e.target.value;
    if (e.target.hasAttribute("data-phone")) state.phone = e.target.value;
    var c = sheet.querySelector("[data-confirm]");
    if (c) c.disabled = !(state.name && state.phone);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay.classList.contains("open")) close(); });

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-booking], a[href='#book'], a[href='#reserve'], a[href='#book-flow']");
    if (!t) return;
    e.preventDefault();
    open();
  });
  window.NEC_openBooking = open;
})();
