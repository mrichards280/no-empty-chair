/* No Empty Chair — shared live-booking overlay for demo sites.
   Configure per demo with window.NEC_BOOKING (a JS object, so showIf can be a fn):
   {
     brand:"POPPI", markSrc:"/demos/_nec-mark.svg",
     theme:{accent,accentSoft,onAccent,surface,bg,ink},
     flow:[
       {key,label,sub,type:'single'|'multi',optional?,showIf?(answers),
        options:[{name,price?,p?}]},
       ...
     ],
     deposit:"$20", address:"...", confirmVerb:"booked"
   }
   Back-compat: if no flow, a `services` (+ optional `enhancements`) array is
   wrapped into a simple flow.
*/
(function () {
  var CFG = window.NEC_BOOKING || {};
  var T = CFG.theme || {};
  var flow = CFG.flow;
  if (!flow || !flow.length) {
    flow = [];
    if (CFG.services) flow.push({ key: "service", label: "Choose your service", type: "single", options: CFG.services });
    if (CFG.enhancements) flow.push({ key: "enh", label: "Add enhancements", type: "multi", optional: true, options: CFG.enhancements });
  }
  var DAYNAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SLOTS = ["10:00a", "11:30a", "1:00p", "2:30p", "4:00p", "5:30p", "7:00p"];

  var days = [], baseDate = new Date();
  for (var i = 0; i < 8; i++) days.push(new Date(baseDate.getTime() + i * 86400000));
  function dayLabel(d, i) { if (i === 0) return "Today"; if (i === 1) return "Tmrw"; return DAYNAMES[d.getDay()] + " " + d.getDate(); }
  function slotTaken(dayIdx, slotIdx) { return ((dayIdx * 3 + slotIdx * 5) % 7) < 2; }

  var markSrc = CFG.markSrc || "/demos/_nec-mark.svg";
  function markImg(px) { return '<img src="' + markSrc + '" alt="" width="' + Math.round(px * 0.79) + '" height="' + px + '" style="display:inline-block;vertical-align:middle">'; }

  var state = { step: 0, answers: {}, dayIdx: 0, slot: null, name: "", phone: "" };

  var overlay = document.createElement("div");
  overlay.className = "nec-bk-overlay";
  overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", "Book an appointment");
  ["accent", "accentSoft", "onAccent", "surface", "bg", "ink"].forEach(function (k) {
    var v = T[k]; if (v) overlay.style.setProperty("--bk-" + (k === "accentSoft" ? "accent-soft" : k === "onAccent" ? "on-accent" : k), v);
  });
  overlay.innerHTML = '<div class="nec-bk-scrim" data-close></div><div class="nec-bk-sheet"></div>';
  document.body.appendChild(overlay);
  var sheet = overlay.querySelector(".nec-bk-sheet");

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function money(n) { return "$" + n; }

  // steps visible given current answers (question steps only)
  function qsteps() { return flow.filter(function (s) { return !s.showIf || s.showIf(state.answers); }); }
  function total() {
    var t = 0;
    qsteps().forEach(function (s) {
      var a = state.answers[s.key]; if (!a) return;
      if (s.type === "multi") a.forEach(function (o) { t += o.p || 0; });
      else t += a.p || 0;
    });
    return t;
  }
  function open() { state = { step: 0, answers: {}, dayIdx: 0, slot: null, name: "", phone: "" }; render(); overlay.classList.add("open"); document.body.style.overflow = "hidden"; }
  function close() { overlay.classList.remove("open"); document.body.style.overflow = ""; }
  function go(d) { state.step = Math.max(0, state.step + d); render(); }

  function bars(n, cur) { var s = ""; for (var i = 0; i < n; i++) s += '<i class="' + (i <= cur ? "on" : "") + '"></i>'; return '<div class="nec-bk-steps">' + s + "</div>"; }
  function head() { return '<div class="nec-bk-head"><div class="nec-bk-brand">' + markImg(17) + " " + esc(CFG.brand || "Book") + '</div><button class="nec-bk-x" data-close aria-label="Close">&times;</button></div>'; }
  function signature() { return '<div class="nec-bk-fine">' + markImg(14) + " Booking flow designed by No Empty Chair</div>"; }
  function summaryRows() {
    var rows = "";
    qsteps().forEach(function (s) {
      var a = state.answers[s.key]; if (!a || (s.type === "multi" && !a.length)) return;
      var val = s.type === "multi" ? a.map(function (o) { return esc(o.name); }).join(", ") : esc(a.name);
      rows += "<div><span>" + esc(s.label) + "</span><span>" + val + "</span></div>";
    });
    return rows;
  }

  function render() {
    var qs = qsteps();
    var nbars = qs.length + 2; // + when + details (exclude done)
    var pos = state.step;
    var html = head();

    if (pos < qs.length) {
      var s = qs[pos]; html += bars(nbars, pos);
      html += '<div class="nec-bk-h">' + esc(s.label) + '</div>' + (s.sub ? '<div class="nec-bk-sub">' + esc(s.sub) + "</div>" : '<div class="nec-bk-sub">' + (s.type === "multi" ? "Tap any that apply — optional." : "Tap to choose.") + "</div>");
      s.options.forEach(function (o, i) {
        if (o.heading) { html += '<div class="nec-bk-group">' + esc(o.heading) + "</div>"; return; }
        var sel = s.type === "multi" ? ((state.answers[s.key] || []).indexOf(o) > -1) : (state.answers[s.key] === o);
        var ico = o.icon ? '<span class="nec-bk-ico">' + o.icon + "</span>" : "";
        var left = '<span class="nec-bk-optl">' + ico + "<span><b>" + esc(o.name) + "</b>" + (o.desc ? "<small>" + esc(o.desc) + "</small>" : "") + "</span></span>";
        var right = o.price ? '<span class="pr">' + (sel && s.type === "multi" ? "✓ " : "") + esc(o.price) + "</span>" : (sel && s.type === "multi" ? '<span class="pr">✓</span>' : "");
        html += '<button class="nec-bk-opt' + (o.icon ? " has-ico" : "") + " " + (sel ? "sel" : "") + '" data-opt="' + i + '">' + left + right + "</button>";
      });
      if (total() > 0) html += '<div class="nec-bk-sum"><div><span>Running total</span><span>' + money(total()) + "</span></div></div>";
      var need = s.type !== "multi" && !s.optional && !state.answers[s.key];
      html += '<button class="nec-bk-cta" data-next ' + (need ? "disabled" : "") + ">" + (pos === qs.length - 1 ? "Choose a time →" : "Continue →") + "</button>";
      if (pos > 0) html += '<button class="nec-bk-back" data-back>← Back</button>';
    } else if (pos === qs.length) { // when
      html += bars(nbars, pos);
      html += '<div class="nec-bk-h">Pick a time</div><div class="nec-bk-sub">' + money(total()) + ' est. · final quote confirmed in-studio</div>';
      html += '<div class="nec-bk-daylab">Day</div><div class="nec-bk-chips">';
      days.forEach(function (d, i) { html += '<button class="nec-bk-chip ' + (state.dayIdx === i ? "sel" : "") + '" data-day="' + i + '">' + dayLabel(d, i) + "</button>"; });
      html += "</div>";
      var d0 = days[state.dayIdx];
      html += '<div class="nec-bk-daylab">' + DAYNAMES[d0.getDay()] + ", " + MONTHS[d0.getMonth()] + " " + d0.getDate() + '</div><div class="nec-bk-chips">';
      SLOTS.forEach(function (t, si) { var taken = slotTaken(state.dayIdx, si); html += '<button class="nec-bk-chip ' + (state.slot === t ? "sel" : "") + '" data-slot="' + t + '" ' + (taken ? "disabled" : "") + ">" + t + "</button>"; });
      html += "</div>";
      html += '<button class="nec-bk-cta" data-next ' + (state.slot === null ? "disabled" : "") + '>Continue →</button><button class="nec-bk-back" data-back>← Back</button>';
    } else if (pos === qs.length + 1) { // details
      html += bars(nbars, qs.length + 1);
      var d2 = days[state.dayIdx];
      html += '<div class="nec-bk-h">Almost done.</div><div class="nec-bk-sub">Who\'s the appointment for?</div>';
      html += '<div class="nec-bk-sum">' + summaryRows() + '<div><span>When</span><span>' + dayLabel(d2, state.dayIdx) + " · " + state.slot + "</span></div><div><span>Est. total</span><span>" + money(total()) + "</span></div></div>";
      html += '<input class="nec-bk-field" data-name placeholder="Your name" value="' + esc(state.name) + '" autocomplete="name"><input class="nec-bk-field" data-phone placeholder="Mobile number" value="' + esc(state.phone) + '" inputmode="tel" autocomplete="tel">';
      html += '<button class="nec-bk-cta" data-confirm ' + (state.name && state.phone ? "" : "disabled") + ">Confirm" + (CFG.deposit ? " · " + esc(CFG.deposit) + " deposit" : "") + "</button><button class=\"nec-bk-back\" data-back>← Back</button>";
    } else { // done
      var d3 = days[state.dayIdx];
      var code = "NEC-" + (1000 + ((state.dayIdx * 31 + SLOTS.indexOf(state.slot) * 7 + qs.length * 13) % 8999));
      html += '<div class="nec-bk-center"><div class="nec-bk-check">✓</div><div class="nec-bk-h">You\'re ' + esc(CFG.confirmVerb || "booked") + ", " + esc(state.name.split(" ")[0] || "") + '!</div><div class="nec-bk-sub">A confirmation text is on its way.</div></div>';
      html += '<div class="nec-bk-sum">' + summaryRows() + '<div><span>When</span><span>' + dayLabel(d3, state.dayIdx) + " · " + state.slot + "</span></div>" + (CFG.address ? '<div><span>Where</span><span>' + esc(CFG.address) + "</span></div>" : "") + '<div><span>Est. total</span><span>' + money(total()) + '</span></div><div><span>Confirmation</span><span>' + code + "</span></div></div>";
      html += '<button class="nec-bk-cta" data-close>Done</button>';
    }
    html += signature();
    sheet.innerHTML = html;
  }

  overlay.addEventListener("click", function (e) {
    var t = e.target.closest("[data-close],[data-next],[data-back],[data-opt],[data-day],[data-slot],[data-confirm]");
    if (!t) return;
    var qs = qsteps();
    if (t.hasAttribute("data-close")) return close();
    if (t.hasAttribute("data-opt")) {
      var s = qs[state.step], o = s.options[+t.getAttribute("data-opt")];
      if (s.type === "multi") { var arr = state.answers[s.key] || [], k = arr.indexOf(o); if (k > -1) arr.splice(k, 1); else arr.push(o); state.answers[s.key] = arr; }
      else state.answers[s.key] = o;
      return render();
    }
    if (t.hasAttribute("data-day")) { state.dayIdx = +t.getAttribute("data-day"); state.slot = null; return render(); }
    if (t.hasAttribute("data-slot")) { if (t.disabled) return; state.slot = t.getAttribute("data-slot"); return render(); }
    if (t.hasAttribute("data-back")) return go(-1);
    if (t.hasAttribute("data-next")) { if (t.disabled) return; return go(1); }
    if (t.hasAttribute("data-confirm")) { if (t.disabled) return; state.step = qs.length + 2; return render(); }
  });
  sheet.addEventListener("input", function (e) {
    if (e.target.hasAttribute("data-name")) state.name = e.target.value;
    if (e.target.hasAttribute("data-phone")) state.phone = e.target.value;
    var c = sheet.querySelector("[data-confirm]"); if (c) c.disabled = !(state.name && state.phone);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay.classList.contains("open")) close(); });
  document.addEventListener("click", function (e) { var t = e.target.closest("[data-booking], a[href='#book'], a[href='#reserve'], a[href='#book-flow']"); if (!t) return; e.preventDefault(); open(); });
  window.NEC_openBooking = open;
})();
