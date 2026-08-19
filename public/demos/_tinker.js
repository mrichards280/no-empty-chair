/* No Empty Chair — demo "Arrange" mode.
   Add ?edit to the URL to get a drag toolbar. Drag elements to reposition them;
   offsets persist in localStorage (this browser only) and can be copied to hand
   back for baking in permanently. Normal visitors never see the toolbar, and see
   the default layout unless offsets have been baked into the page CSS.
*/
(function () {
  var KEY = "nec_layout_" + location.pathname;
  var store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}

  // curated set of movable pieces (keeps links/inputs safe elsewhere)
  var SEL = ".cell,.slotline,.slotline span,.bookmini,.finpill,.scard,.rl,.reel,.pstep,.review,.rc,.tile,.shot,.hphoto,.htext,.sec-head,.eyebrow,.lead,.big-n,.tag,.lbl,.hero h1,h2";

  function path(el) {
    var p = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      var i = 1, s = el.previousElementSibling;
      while (s) { i++; s = s.previousElementSibling; }
      p.unshift(el.tagName.toLowerCase() + ":" + i);
      el = el.parentElement;
    }
    return p.join(">");
  }
  function movables() { return [].slice.call(document.querySelectorAll(SEL)); }
  function applySaved() {
    movables().forEach(function (el) {
      var o = store[path(el)];
      if (o) { el.style.transform = "translate(" + o.x + "px," + o.y + "px)"; el.style.position = el.style.position || "relative"; }
    });
  }
  applySaved();

  // toolbar only when ?edit is present
  if (!/[?&]edit\b/.test(location.search)) return;

  var css = document.createElement("style");
  css.textContent =
    "body._tedit " + SEL.split(",").map(function (s) { return s + ":hover"; }).join(",body._tedit ") +
    "{outline:2px dashed #c25b3a !important;outline-offset:2px;cursor:move;}" +
    "._tbar{position:fixed;left:14px;bottom:14px;z-index:99999;display:flex;gap:8px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;}" +
    "._tbar button{border:none;border-radius:100px;padding:11px 16px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25);}" +
    "._tbar .sec{background:#fff;color:#111;border:1px solid #d8d1c4;} ._thint{position:fixed;left:14px;bottom:60px;z-index:99999;background:#111;color:#fff;font-family:system-ui,sans-serif;font-size:12px;padding:8px 12px;border-radius:10px;max-width:230px;box-shadow:0 8px 24px rgba(0,0,0,.25);}";
  document.head.appendChild(css);

  var bar = document.createElement("div");
  bar.className = "_tbar";
  bar.innerHTML =
    '<button id="_te" style="background:#111;color:#fff">✎ Arrange</button>' +
    '<button id="_tr" class="sec" style="display:none">Reset</button>' +
    '<button id="_tc" class="sec" style="display:none">Copy layout</button>';
  document.body.appendChild(bar);
  var hint = document.createElement("div");
  hint.className = "_thint"; hint.style.display = "none";
  hint.textContent = "Drag any piece to move it. It stays put on reload. Hit Copy layout and send it to me to make it permanent.";
  document.body.appendChild(hint);

  var editing = false, cur = null, sx, sy, ox, oy;
  function setEdit(v) {
    editing = v;
    var e = document.getElementById("_te");
    e.textContent = v ? "✓ Done" : "✎ Arrange";
    e.style.background = v ? "#c25b3a" : "#111";
    document.getElementById("_tr").style.display = v ? "inline-block" : "none";
    document.getElementById("_tc").style.display = v ? "inline-block" : "none";
    hint.style.display = v ? "block" : "none";
    document.body.classList.toggle("_tedit", v);
  }
  document.getElementById("_te").onclick = function () { setEdit(!editing); };
  document.getElementById("_tr").onclick = function () {
    store = {}; localStorage.removeItem(KEY);
    movables().forEach(function (el) { el.style.transform = ""; });
  };
  document.getElementById("_tc").onclick = function () {
    var txt = JSON.stringify(store);
    var done = function () { var b = document.getElementById("_tc"); b.textContent = "Copied!"; setTimeout(function () { b.textContent = "Copy layout"; }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, function () { window.prompt("Copy this and send it to me:", txt); });
    else window.prompt("Copy this and send it to me:", txt);
  };

  function xy(el) {
    var m = (getComputedStyle(el).transform || "").match(/matrix\(1, 0, 0, 1, (-?[\d.]+), (-?[\d.]+)\)/);
    return { x: m ? parseFloat(m[1]) : 0, y: m ? parseFloat(m[2]) : 0 };
  }
  document.addEventListener("pointerdown", function (e) {
    if (!editing) return;
    var el = e.target.closest(SEL); if (!el) return;
    e.preventDefault();
    cur = el; var c = xy(el); ox = c.x; oy = c.y; sx = e.clientX; sy = e.clientY;
    el.style.position = el.style.position || "relative";
  }, true);
  document.addEventListener("pointermove", function (e) {
    if (!cur) return;
    var x = Math.round(ox + (e.clientX - sx)), y = Math.round(oy + (e.clientY - sy));
    cur.style.transform = "translate(" + x + "px," + y + "px)";
    cur.__xy = { x: x, y: y };
  });
  document.addEventListener("pointerup", function () {
    if (!cur) return;
    if (cur.__xy) { store[path(cur)] = cur.__xy; try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
    cur = null;
  });
})();
