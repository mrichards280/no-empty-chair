/* No Empty Chair — shared live-booking overlay for demo sites.
   Configure per demo with window.NEC_BOOKING before this script loads:
   {
     brand:"POPPI", markColor:"#a85a76",
     theme:{accent,accentSoft,onAccent,surface,bg,ink},
     services:[{name,price,dur}], deposit:"$20", address:"...", city:"Atlanta",
     confirmVerb:"booked"      // "You're booked!"
   }
*/
(function () {
  var CFG = window.NEC_BOOKING || {};
  var T = CFG.theme || {};
  var services = CFG.services || [];
  var DAYNAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SLOTS = ["10:00a", "11:30a", "1:00p", "2:30p", "4:00p", "5:30p", "7:00p"];

  // next 8 days starting today
  var days = [];
  var base = new Date();
  for (var i = 0; i < 8; i++) {
    var d = new Date(base.getTime() + i * 86400000);
    days.push(d);
  }
  function dayLabel(d, i) {
    if (i === 0) return "Today";
    if (i === 1) return "Tmrw";
    return DAYNAMES[d.getDay()] + " " + d.getDate();
  }
  // deterministic "taken" slots so it feels live without randomness
  function slotTaken(dayIdx, slotIdx) {
    return ((dayIdx * 3 + slotIdx * 5) % 7) < 2;
  }

  var mark = '<svg width="17" height="17" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M45 40 L21 40 L21 20 Q21 15 26 15"/><path d="M44 40 L46 55"/><path d="M22 40 L20 55"/></g><circle cx="31" cy="29" r="8.5" fill="' + (CFG.markColor || "#a85a76") + '"/></svg>';

  var state = { step: 0, service: null, dayIdx: 0, slot: null, name: "", phone: "" };

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

  function open() { state = { step: 0, service: null, dayIdx: 0, slot: null, name: "", phone: "" }; render(); overlay.classList.add("open"); document.body.style.overflow = "hidden"; }
  function close() { overlay.classList.remove("open"); document.body.style.overflow = ""; }

  function steps() {
    var s = "";
    for (var i = 0; i < 4; i++) s += '<i class="' + (i <= state.step ? "on" : "") + '"></i>';
    return '<div class="nec-bk-steps">' + s + "</div>";
  }
  function head() {
    return '<div class="nec-bk-head"><div class="nec-bk-brand">' + mark + " " + esc(CFG.brand || "Book") + '</div><button class="nec-bk-x" data-close aria-label="Close">&times;</button></div>';
  }
  function signature() {
    return '<div class="nec-bk-fine">' + mark + " Booking flow designed by No Empty Chair</div>";
  }

  function render() {
    var html = head() + steps();
    if (state.step === 0) {
      html += '<div class="nec-bk-h">What are we booking?</div><div class="nec-bk-sub">Pick a service to see live openings.</div>';
      services.forEach(function (sv, i) {
        html += '<button class="nec-bk-opt ' + (state.service === i ? "sel" : "") + '" data-svc="' + i + '"><span><b>' + esc(sv.name) + "</b>" + (sv.dur ? "<small>" + esc(sv.dur) + "</small>" : "") + '</span><span class="pr">' + esc(sv.price) + "</span></button>";
      });
      html += '<button class="nec-bk-cta" data-next ' + (state.service === null ? "disabled" : "") + ">Choose a time →</button>";
    } else if (state.step === 1) {
      var sv = services[state.service];
      html += '<div class="nec-bk-h">' + esc(sv.name) + '</div><div class="nec-bk-sub">' + esc(sv.price) + (sv.dur ? " · " + esc(sv.dur) : "") + '</div>';
      html += '<div class="nec-bk-daylab">Pick a day</div><div class="nec-bk-chips">';
      days.forEach(function (d, i) { html += '<button class="nec-bk-chip ' + (state.dayIdx === i ? "sel" : "") + '" data-day="' + i + '">' + dayLabel(d, i) + "</button>"; });
      html += "</div>";
      var d0 = days[state.dayIdx];
      html += '<div class="nec-bk-daylab">' + DAYNAMES[d0.getDay()] + ", " + MONTHS[d0.getMonth()] + " " + d0.getDate() + '</div><div class="nec-bk-chips">';
      SLOTS.forEach(function (t, si) {
        var taken = slotTaken(state.dayIdx, si);
        html += '<button class="nec-bk-chip ' + (state.slot === t ? "sel" : "") + '" data-slot="' + t + '" ' + (taken ? "disabled" : "") + ">" + t + "</button>";
      });
      html += "</div>";
      html += '<button class="nec-bk-cta" data-next ' + (state.slot === null ? "disabled" : "") + ">Continue →</button>";
      html += '<button class="nec-bk-back" data-back>← Back to services</button>';
    } else if (state.step === 2) {
      var sv2 = services[state.service], d2 = days[state.dayIdx];
      html += '<div class="nec-bk-h">Almost done.</div><div class="nec-bk-sub">Who\'s the appointment for?</div>';
      html += '<div class="nec-bk-sum"><div><span>Service</span><span>' + esc(sv2.name) + "</span></div><div><span>When</span><span>" + dayLabel(d2, state.dayIdx) + " · " + state.slot + "</span></div><div><span>Price</span><span>" + esc(sv2.price) + "</span></div></div>";
      html += '<input class="nec-bk-field" data-name placeholder="Your name" value="' + esc(state.name) + '" autocomplete="name">';
      html += '<input class="nec-bk-field" data-phone placeholder="Mobile number" value="' + esc(state.phone) + '" inputmode="tel" autocomplete="tel">';
      html += '<button class="nec-bk-cta" data-confirm ' + (state.name && state.phone ? "" : "disabled") + ">Confirm booking" + (CFG.deposit ? " · " + esc(CFG.deposit) + " deposit" : "") + "</button>";
      html += '<button class="nec-bk-back" data-back>← Back</button>';
    } else {
      var sv3 = services[state.service], d3 = days[state.dayIdx];
      var code = "NEC-" + (1000 + ((state.dayIdx * 31 + SLOTS.indexOf(state.slot) * 7 + state.service * 13) % 8999));
      html += '<div class="nec-bk-center"><div class="nec-bk-check">✓</div><div class="nec-bk-h">You\'re ' + esc(CFG.confirmVerb || "booked") + ", " + esc(state.name.split(" ")[0] || "") + '!</div><div class="nec-bk-sub">A confirmation text is on its way.</div></div>';
      html += '<div class="nec-bk-sum"><div><span>Service</span><span>' + esc(sv3.name) + "</span></div><div><span>When</span><span>" + dayLabel(d3, state.dayIdx) + " · " + state.slot + "</span></div>" + (CFG.address ? '<div><span>Where</span><span>' + esc(CFG.address) + "</span></div>" : "") + '<div><span>Confirmation</span><span>' + code + "</span></div></div>";
      html += '<button class="nec-bk-cta" data-close>Done</button>';
    }
    html += signature();
    sheet.innerHTML = html;
  }

  overlay.addEventListener("click", function (e) {
    var t = e.target.closest("[data-close],[data-next],[data-back],[data-svc],[data-day],[data-slot],[data-confirm]");
    if (!t) return;
    if (t.hasAttribute("data-close")) return close();
    if (t.hasAttribute("data-svc")) { state.service = +t.getAttribute("data-svc"); return render(); }
    if (t.hasAttribute("data-day")) { state.dayIdx = +t.getAttribute("data-day"); state.slot = null; return render(); }
    if (t.hasAttribute("data-slot")) { if (t.disabled) return; state.slot = t.getAttribute("data-slot"); return render(); }
    if (t.hasAttribute("data-back")) { state.step--; return render(); }
    if (t.hasAttribute("data-next")) { if (t.disabled) return; state.step++; return render(); }
    if (t.hasAttribute("data-confirm")) { if (t.disabled) return; state.step = 3; return render(); }
  });
  sheet.addEventListener("input", function (e) {
    if (e.target.hasAttribute("data-name")) state.name = e.target.value;
    if (e.target.hasAttribute("data-phone")) state.phone = e.target.value;
    var c = sheet.querySelector("[data-confirm]");
    if (c) c.disabled = !(state.name && state.phone);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay.classList.contains("open")) close(); });

  // Bind triggers: anything marked data-booking, or links to #book / #reserve.
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-booking], a[href='#book'], a[href='#reserve'], a[href='#book-flow']");
    if (!t) return;
    e.preventDefault();
    open();
  });
  window.NEC_openBooking = open;
})();
