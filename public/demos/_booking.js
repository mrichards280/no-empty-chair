/* No Empty Chair — shared live-booking overlay for demo sites.
   Phased flow with a multi-service cart, per-visit add-ons, a PENDING (not
   auto-confirmed) request, and tentative Google/Apple/Outlook calendar holds.
   Config via window.NEC_BOOKING (a JS object, so showIf can be a fn):
   {
     brand, markSrc, theme:{...}, deposit, address, apptTitle,
     flow:[ {key,label,sub,type:'single'|'multi',optional?,perVisit?,showIf?(a),
             options:[{name,price?,p?,desc?,icon?,heading?}]} ]
   }
*/
(function () {
  var CFG = window.NEC_BOOKING || {};
  var T = CFG.theme || {};
  var flow = CFG.flow || [];
  var svcFlow = flow.filter(function (s) { return !s.perVisit; });
  var visitFlow = flow.filter(function (s) { return s.perVisit; });
  var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SLOTS = ["10:00a", "11:30a", "1:00p", "2:30p", "4:00p", "5:30p", "7:00p"];

  var days = [], base = new Date();
  for (var i = 0; i < 8; i++) days.push(new Date(base.getTime() + i * 86400000));
  function dayLabel(d, i) { if (i === 0) return "Today"; if (i === 1) return "Tmrw"; return DAY[d.getDay()] + " " + d.getDate(); }
  function slotTaken(di, si) { return ((di * 3 + si * 5) % 7) < 2; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  var markSrc = CFG.markSrc || "/demos/_nec-mark.svg";
  function markImg(px) { return '<img src="' + markSrc + '" alt="" width="' + Math.round(px * 0.79) + '" height="' + px + '" style="display:inline-block;vertical-align:middle">'; }

  var state = blank();
  function blank() { return { phase: "service", si: 0, answers: {}, cart: [], visit: {}, vi: 0, dayIdx: 0, slot: null, name: "", phone: "", inspo: { links: "", thumbs: [] } }; }
  function inspoSummary() { var t = state.inspo.thumbs.length, l = state.inspo.links.trim(); if (!t && !l) return ""; var parts = []; if (t) parts.push(t + " photo" + (t > 1 ? "s" : "")); if (l) parts.push("links"); return parts.join(" + "); }

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

  function svcSteps() { return svcFlow.filter(function (s) { return !s.showIf || s.showIf(state.answers); }); }
  function visitSteps() { return visitFlow.filter(function (s) { return !s.showIf || s.showIf(state.visit); }); }
  function priceOf(flowArr, ans) {
    var t = 0;
    flowArr.filter(function (s) { return !s.showIf || s.showIf(ans); }).forEach(function (s) {
      var a = ans[s.key]; if (!a) return;
      if (s.type === "multi") a.forEach(function (o) { t += o.p || 0; }); else t += a.p || 0;
    });
    return t;
  }
  function itemPrice(ans) { return priceOf(svcFlow, ans); }
  var firstKey = svcFlow[0] && svcFlow[0].key;
  function itemLabel(ans) { var a = firstKey && ans[firstKey]; return a ? a.name : "Service"; }
  function itemDetail(ans) {
    var bits = [];
    svcFlow.filter(function (s) { return !s.showIf || s.showIf(ans); }).forEach(function (s) {
      if (s.key === firstKey) return;
      var a = ans[s.key]; if (!a || (s.type === "multi" && !a.length)) return;
      bits.push(s.type === "multi" ? a.map(function (o) { return o.name; }).join(", ") : a.name);
    });
    return bits.join(" · ");
  }
  function visitPrice() { return priceOf(visitFlow, state.visit); }
  function cartPrice() { return state.cart.reduce(function (s, i) { return s + i.price; }, 0); }
  function grandTotal() { return cartPrice() + visitPrice(); }
  function commitItem() {
    if (!firstKey || !state.answers[firstKey]) return;
    state.cart.push({ answers: state.answers, label: itemLabel(state.answers), detail: itemDetail(state.answers), price: itemPrice(state.answers) });
    state.answers = {};
  }

  function open() { state = blank(); render(); overlay.classList.add("open"); document.body.style.overflow = "hidden"; }
  function close() { overlay.classList.remove("open"); document.body.style.overflow = ""; }

  function head() { return '<div class="nec-bk-head"><div class="nec-bk-brand">' + markImg(17) + " " + esc(CFG.brand || "Book") + '</div><button class="nec-bk-x" data-close aria-label="Close">&times;</button></div>'; }
  function signature() { return '<div class="nec-bk-fine">' + markImg(14) + " Booking flow designed by No Empty Chair</div>"; }
  function bars(n, cur) { var s = ""; for (var i = 0; i < n; i++) s += '<i class="' + (i <= cur ? "on" : "") + '"></i>'; return '<div class="nec-bk-steps">' + s + "</div>"; }

  function optionRow(s, o, i) {
    if (o.heading) return '<div class="nec-bk-group">' + esc(o.heading) + "</div>";
    var scope = s.perVisit ? state.visit : state.answers;
    var sel = s.type === "multi" ? ((scope[s.key] || []).indexOf(o) > -1) : (scope[s.key] === o);
    var ico = o.icon ? '<span class="nec-bk-ico">' + o.icon + "</span>" : "";
    var left = '<span class="nec-bk-optl">' + ico + "<span><b>" + esc(o.name) + "</b>" + (o.desc ? "<small>" + esc(o.desc) + "</small>" : "") + "</span></span>";
    var right = o.price ? '<span class="pr">' + (sel && s.type === "multi" ? "✓ " : "") + esc(o.price) + "</span>" : (sel && s.type === "multi" ? '<span class="pr">✓</span>' : "");
    return '<button class="nec-bk-opt' + (o.icon ? " has-ico" : "") + " " + (sel ? "sel" : "") + '" data-opt="' + i + '">' + left + right + "</button>";
  }

  // ---- calendar helpers (client-side; Date is fine in the browser) ----
  function apptStart() { var d = days[state.dayIdx]; var m = String(state.slot).match(/(\d+):(\d+)([ap])/); var h = (+m[1]) % 12; if (m[3] === "p") h += 12; return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, +m[2], 0); }
  function stampLocal(dt) { return dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + "T" + pad(dt.getHours()) + pad(dt.getMinutes()) + "00"; }
  function isoLocal(dt) { return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()) + "T" + pad(dt.getHours()) + ":" + pad(dt.getMinutes()) + ":00"; }
  function orderText() {
    var lines = state.cart.map(function (it) { return "• " + it.label + (it.detail ? " (" + it.detail + ")" : "") + " — " + money(it.price); });
    var add = []; visitFlow.forEach(function (s) { var a = state.visit[s.key]; if (!a) return; (s.type === "multi" ? a : [a]).forEach(function (o) { if (o.p) add.push(o.name + " +" + money(o.p)); else add.push(o.name); }); });
    if (add.length) lines.push("Add-ons: " + add.join(", "));
    lines.push("Estimated total: " + money(grandTotal()) + " · PENDING confirmation");
    return lines.join("\n");
  }
  function calLinks() {
    var start = apptStart(), end = new Date(start.getTime() + 60 * 60000);
    var title = CFG.apptTitle || (CFG.brand + " appointment (tentative)");
    var body = orderText(), loc = CFG.address || "";
    var g = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&dates=" + stampLocal(start) + "/" + stampLocal(end) + "&details=" + encodeURIComponent(body) + "&location=" + encodeURIComponent(loc);
    var o = "https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=" + encodeURIComponent(title) + "&startdt=" + isoLocal(start) + "&enddt=" + isoLocal(end) + "&body=" + encodeURIComponent(body) + "&location=" + encodeURIComponent(loc);
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//No Empty Chair//Demo//EN", "BEGIN:VEVENT", "DTSTART:" + stampLocal(start), "DTEND:" + stampLocal(end), "SUMMARY:" + title, "DESCRIPTION:" + body.replace(/\n/g, "\\n"), "LOCATION:" + loc, "STATUS:TENTATIVE", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    var a = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
    return { g: g, o: o, a: a };
  }

  function render() {
    var html = head();
    var phase = state.phase;

    if (phase === "service") {
      var qs = svcSteps(), s = qs[state.si];
      var nbars = qs.length + 3; // steps + cart + when + details
      html += bars(nbars, state.si);
      html += '<div class="nec-bk-h">' + esc(s.label) + '</div>' + (s.sub ? '<div class="nec-bk-sub">' + esc(s.sub) + "</div>" : '<div class="nec-bk-sub">' + (s.type === "multi" ? "Tap any that apply — optional." : "Tap to choose.") + "</div>");
      s.options.forEach(function (o, i) { html += optionRow(s, o, i); });
      if (itemPrice(state.answers) > 0) html += '<div class="nec-bk-sum"><div><span>This service</span><span>' + money(itemPrice(state.answers)) + "</span></div></div>";
      var need = s.type !== "multi" && !s.optional && !state.answers[s.key];
      var last = state.si === qs.length - 1;
      html += '<button class="nec-bk-cta" data-next ' + (need ? "disabled" : "") + ">" + (last ? "Add to order →" : "Continue →") + "</button>";
      if (state.si > 0) html += '<button class="nec-bk-back" data-back>← Back</button>';
      else if (state.cart.length) html += '<button class="nec-bk-back" data-tocart>← Back to order</button>';
    } else if (phase === "cart") {
      html += bars(svcSteps().length + 3, svcSteps().length);
      html += '<div class="nec-bk-h">Your order</div><div class="nec-bk-sub">Add as many services as you like.</div>';
      state.cart.forEach(function (it, i) {
        html += '<div class="nec-bk-line"><div><b>' + esc(it.label) + "</b>" + (it.detail ? "<small>" + esc(it.detail) + "</small>" : "") + '</div><div class="nec-bk-liner"><span>' + money(it.price) + '</span><button class="nec-bk-rm" data-rm="' + i + '" aria-label="Remove">&times;</button></div></div>';
      });
      html += '<div class="nec-bk-sum"><div><span>Order total</span><span>' + money(cartPrice()) + "</span></div></div>";
      html += '<button class="nec-bk-add" data-addmore>+ Add another service</button>';
      html += '<button class="nec-bk-cta" ' + (state.cart.length ? "" : "disabled") + " data-tovisit>Continue →</button>";
    } else if (phase === "visit") {
      var vs = visitSteps(), v = vs[state.vi];
      html += bars(svcSteps().length + 3, svcSteps().length + 1);
      html += '<div class="nec-bk-h">' + esc(v.label) + '</div>' + (v.sub ? '<div class="nec-bk-sub">' + esc(v.sub) + "</div>" : '<div class="nec-bk-sub">Optional — tap to add.</div>');
      v.options.forEach(function (o, i) { html += optionRow(v, o, i); });
      html += '<button class="nec-bk-cta" data-vnext>' + (state.vi === vs.length - 1 ? "Choose a time →" : "Continue →") + "</button>";
      html += '<button class="nec-bk-back" data-vback>← Back</button>';
    } else if (phase === "when") {
      html += bars(svcSteps().length + 3, svcSteps().length + 2);
      html += '<div class="nec-bk-h">Pick a time</div><div class="nec-bk-sub">Est. total ' + money(grandTotal()) + " · times are requests, confirmed by the studio</div>";
      html += '<div class="nec-bk-daylab">Day</div><div class="nec-bk-chips">';
      days.forEach(function (d, i) { html += '<button class="nec-bk-chip ' + (state.dayIdx === i ? "sel" : "") + '" data-day="' + i + '">' + dayLabel(d, i) + "</button>"; });
      html += "</div>";
      var d0 = days[state.dayIdx];
      html += '<div class="nec-bk-daylab">' + DAY[d0.getDay()] + ", " + MON[d0.getMonth()] + " " + d0.getDate() + '</div><div class="nec-bk-chips">';
      SLOTS.forEach(function (t, si) { var tk = slotTaken(state.dayIdx, si); html += '<button class="nec-bk-chip ' + (state.slot === t ? "sel" : "") + '" data-slot="' + t + '" ' + (tk ? "disabled" : "") + ">" + t + "</button>"; });
      html += "</div>";
      html += '<button class="nec-bk-cta" data-towhen ' + (state.slot === null ? "disabled" : "") + '>Continue →</button><button class="nec-bk-back" data-backvisit>← Back</button>';
    } else if (phase === "details") {
      html += bars(svcSteps().length + 3, svcSteps().length + 3);
      html += '<div class="nec-bk-h">Request your spot</div><div class="nec-bk-sub">We\'ll text you to confirm — nothing is charged yet.</div>';
      html += '<div class="nec-bk-sum">';
      state.cart.forEach(function (it) { html += "<div><span>" + esc(it.label) + "</span><span>" + money(it.price) + "</span></div>"; });
      var vadd = []; visitFlow.forEach(function (s) { var a = state.visit[s.key]; if (!a) return; (s.type === "multi" ? a : [a]).forEach(function (o) { vadd.push(o.name); }); });
      if (vadd.length) html += "<div><span>Add-ons</span><span>" + esc(vadd.join(", ")) + "</span></div>";
      html += "<div><span>When</span><span>" + dayLabel(days[state.dayIdx], state.dayIdx) + " · " + state.slot + "</span></div><div><span>Est. total</span><span>" + money(grandTotal()) + "</span></div></div>";
      html += '<input class="nec-bk-field" data-name placeholder="Your name" value="' + esc(state.name) + '" autocomplete="name"><input class="nec-bk-field" data-phone placeholder="Mobile number" value="' + esc(state.phone) + '" inputmode="tel" autocomplete="tel">';
      html += '<div class="nec-bk-inspo"><div class="nec-bk-inspolbl">Bring your inspiration <span>(optional)</span></div>';
      html += '<label class="nec-bk-uplbl">📎 Add inspo photos<input type="file" accept="image/*" multiple hidden data-inspo-files></label>';
      html += '<div class="nec-bk-thumbs" data-thumbs>' + state.inspo.thumbs.map(function (t) { return '<span class="nec-bk-thumb" style="background-image:url(' + t + ')"></span>'; }).join("") + "</div>";
      html += '<textarea class="nec-bk-field" data-inspo-links rows="2" placeholder="Or paste inspo links — Instagram, TikTok, Pinterest">' + esc(state.inspo.links) + "</textarea></div>";
      html += '<button class="nec-bk-cta" data-confirm ' + (state.name && state.phone ? "" : "disabled") + ">Request appointment" + (CFG.deposit ? " · " + esc(CFG.deposit) + " deposit" : "") + "</button><button class=\"nec-bk-back\" data-backwhen>← Back</button>";
    } else { // done — PENDING
      var links = calLinks();
      html += '<div class="nec-bk-center"><div class="nec-bk-check nec-bk-pending">🕓</div><div class="nec-bk-h">Request sent, ' + esc(state.name.split(" ")[0] || "") + "!</div><div class=\"nec-bk-sub\">Your spot is <b>pending</b> — " + esc(CFG.brand) + " will text you shortly to confirm. Nothing is charged yet.</div></div>";
      html += '<div class="nec-bk-sum">';
      state.cart.forEach(function (it) { html += "<div><span>" + esc(it.label) + "</span><span>" + money(it.price) + "</span></div>"; });
      html += "<div><span>Requested</span><span>" + dayLabel(days[state.dayIdx], state.dayIdx) + " · " + state.slot + "</span></div>" + (inspoSummary() ? "<div><span>Inspo</span><span>" + esc(inspoSummary()) + "</span></div>" : "") + "<div><span>Est. total</span><span>" + money(grandTotal()) + "</span></div></div>";
      html += '<div class="nec-bk-callabel">Add a tentative hold to your calendar</div><div class="nec-bk-cal">';
      html += '<a class="nec-bk-calbtn" href="' + links.g + '" target="_blank" rel="noopener">Google</a>';
      html += '<a class="nec-bk-calbtn" href="' + links.a + '" download="' + esc((CFG.brand || "appointment")) + '.ics">Apple</a>';
      html += '<a class="nec-bk-calbtn" href="' + links.o + '" target="_blank" rel="noopener">Outlook</a></div>';
      html += '<button class="nec-bk-cta" data-close>Done</button>';
    }
    html += signature();
    sheet.innerHTML = html;
  }

  overlay.addEventListener("click", function (e) {
    var t = e.target.closest("[data-close],[data-next],[data-back],[data-tocart],[data-opt],[data-addmore],[data-tovisit],[data-rm],[data-vnext],[data-vback],[data-day],[data-slot],[data-towhen],[data-backvisit],[data-confirm],[data-backwhen]");
    if (!t) return;
    if (t.hasAttribute("data-close")) return close();
    // option select (service or visit)
    if (t.hasAttribute("data-opt")) {
      var arr, step, o;
      if (state.phase === "service") { step = svcSteps()[state.si]; o = step.options[+t.getAttribute("data-opt")]; }
      else { step = visitSteps()[state.vi]; o = step.options[+t.getAttribute("data-opt")]; }
      var scope = step.perVisit ? state.visit : state.answers;
      if (step.type === "multi") { arr = scope[step.key] || []; var k = arr.indexOf(o); if (k > -1) arr.splice(k, 1); else arr.push(o); scope[step.key] = arr; }
      else scope[step.key] = o;
      return render();
    }
    if (t.hasAttribute("data-next")) { if (t.disabled) return; var qs = svcSteps(); if (state.si < qs.length - 1) state.si++; else { commitItem(); state.phase = "cart"; } return render(); }
    if (t.hasAttribute("data-back")) { if (state.si > 0) state.si--; return render(); }
    if (t.hasAttribute("data-tocart")) { state.answers = {}; state.si = 0; state.phase = "cart"; return render(); }
    if (t.hasAttribute("data-rm")) { state.cart.splice(+t.getAttribute("data-rm"), 1); return render(); }
    if (t.hasAttribute("data-addmore")) { state.answers = {}; state.si = 0; state.phase = "service"; return render(); }
    if (t.hasAttribute("data-tovisit")) { if (t.disabled) return; state.vi = 0; state.phase = visitSteps().length ? "visit" : "when"; return render(); }
    if (t.hasAttribute("data-vnext")) { var vs = visitSteps(); if (state.vi < vs.length - 1) state.vi++; else state.phase = "when"; return render(); }
    if (t.hasAttribute("data-vback")) { if (state.vi > 0) state.vi--; else state.phase = "cart"; return render(); }
    if (t.hasAttribute("data-day")) { state.dayIdx = +t.getAttribute("data-day"); state.slot = null; return render(); }
    if (t.hasAttribute("data-slot")) { if (t.disabled) return; state.slot = t.getAttribute("data-slot"); return render(); }
    if (t.hasAttribute("data-towhen")) { if (t.disabled) return; state.phase = "details"; return render(); }
    if (t.hasAttribute("data-backvisit")) { state.phase = visitSteps().length ? "visit" : "cart"; state.vi = Math.max(0, visitSteps().length - 1); return render(); }
    if (t.hasAttribute("data-confirm")) { if (t.disabled) return; state.phase = "done"; return render(); }
    if (t.hasAttribute("data-backwhen")) { state.phase = "when"; return render(); }
  });
  sheet.addEventListener("input", function (e) {
    if (e.target.hasAttribute("data-name")) state.name = e.target.value;
    if (e.target.hasAttribute("data-phone")) state.phone = e.target.value;
    if (e.target.hasAttribute("data-inspo-links")) state.inspo.links = e.target.value;
    var c = sheet.querySelector("[data-confirm]"); if (c) c.disabled = !(state.name && state.phone);
  });
  overlay.addEventListener("change", function (e) {
    if (!e.target.hasAttribute || !e.target.hasAttribute("data-inspo-files")) return;
    var files = e.target.files; if (!files) return;
    var thumbsEl = sheet.querySelector("[data-thumbs]");
    Array.prototype.slice.call(files).slice(0, 8).forEach(function (f) {
      if (!/^image\//.test(f.type)) return;
      var r = new FileReader();
      r.onload = function () { state.inspo.thumbs.push(r.result); if (thumbsEl) { var sp = document.createElement("span"); sp.className = "nec-bk-thumb"; sp.style.backgroundImage = "url(" + r.result + ")"; thumbsEl.appendChild(sp); } };
      r.readAsDataURL(f);
    });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay.classList.contains("open")) close(); });
  document.addEventListener("click", function (e) { var t = e.target.closest("[data-booking], a[href='#book'], a[href='#reserve'], a[href='#book-flow']"); if (!t) return; e.preventDefault(); open(); });
  window.NEC_openBooking = open;
})();
