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

  // every pill + text block + card is its own draggable object (no group containers like .slotline)
  var SEL = ".cell,.scard,.rl,.reel,.tile,.shot,.hphoto,.htext,.review,.rc,.pstep,.sec-head," +
    ".slotline span,.bookmini,.book-btn,.btn-big,.btn-ghost,.reserve,.book,.finpill,.tag,.lbl,.big-n,.cellfoot," +
    ".dur,.price,.go,.stars,.v,.views,.eyebrow,.lead,.kicker,.tagpill,.who,.sig," +
    "h2,h3,h4,.hero h1,blockquote,cite," +
    "p,img,.btn,.navbtn,.navcta,.democard,.card,.stat,.faq-item,.pkg,.pill";

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
  var GRID = 8;
  function snapN(n) { return Math.round(n / GRID) * GRID; }
  function applySaved() {
    // reset then apply, so undo/redo can restore any prior state
    movables().forEach(function (el) {
      var o = store[path(el)];
      el.style.transform = ""; el.style.width = ""; el.style.height = "";
      if (o) {
        if (o.x || o.y) el.style.transform = "translate(" + (o.x || 0) + "px," + (o.y || 0) + "px)";
        if (o.w) el.style.width = o.w + "px";
        if (o.h) el.style.height = o.h + "px";
        el.style.position = el.style.position || "relative";
      }
    });
  }
  applySaved();

  // undo / redo history (up to 3 each)
  var undoStack = [], redoStack = [], CAP = 3, preMove = null;
  function snap() { return JSON.stringify(store); }
  function pushUndo(s) { undoStack.push(s); if (undoStack.length > CAP) undoStack.shift(); redoStack = []; updHist(); }
  function doUndo() { if (!undoStack.length) return; redoStack.push(snap()); if (redoStack.length > CAP) redoStack.shift(); store = JSON.parse(undoStack.pop()); save(); applySaved(); updHist(); }
  function doRedo() { if (!redoStack.length) return; undoStack.push(snap()); if (undoStack.length > CAP) undoStack.shift(); store = JSON.parse(redoStack.pop()); save(); applySaved(); updHist(); }
  function save() { try { if (Object.keys(store).length) localStorage.setItem(KEY, JSON.stringify(store)); else localStorage.removeItem(KEY); } catch (e) {} }
  function updHist() { var u = document.getElementById("_tu"), r = document.getElementById("_trd"); if (u) u.disabled = !undoStack.length; if (r) r.disabled = !redoStack.length; }

  // toolbar shows for ?edit (demos) or when the admin has enabled it (main site)
  var adminOn = false;
  try { adminOn = localStorage.getItem("nec-admin-edit") === "1"; } catch (e) {}
  if (!/[?&]edit\b/.test(location.search) && !adminOn) return;

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
    '<button id="_tu" class="sec ed" style="display:none">↶ Undo</button>' +
    '<button id="_trd" class="sec ed" style="display:none">↷ Redo</button>' +
    '<button id="_tr" class="sec ed" style="display:none">Reset</button>' +
    '<button id="_tc" class="sec ed" style="display:none">Copy layout</button>';
  document.body.appendChild(bar);
  var hint = document.createElement("div");
  hint.className = "_thint"; hint.style.display = "none";
  hint.textContent = "Drag any piece to move it (snaps to a grid). Drag the bottom-right corner to stretch/resize it. Undo/Redo up to 3. Hit Copy layout and send it to me to bake it in.";
  document.body.appendChild(hint);

  var editing = false, cur = null, sx, sy, ox, oy, movedThisDrag = false, mode = "move", startW = 0, startH = 0;
  function setEdit(v) {
    editing = v;
    var e = document.getElementById("_te");
    e.textContent = v ? "✓ Done" : "✎ Arrange";
    e.style.background = v ? "#c25b3a" : "#111";
    [].forEach.call(document.querySelectorAll("._tbar .ed"), function (b) { b.style.display = v ? "inline-block" : "none"; });
    hint.style.display = v ? "block" : "none";
    document.body.classList.toggle("_tedit", v);
    updHist();
  }
  document.getElementById("_te").onclick = function () { setEdit(!editing); };
  document.getElementById("_tu").onclick = doUndo;
  document.getElementById("_trd").onclick = doRedo;
  document.getElementById("_tr").onclick = function () {
    if (!Object.keys(store).length) return;
    pushUndo(snap());
    store = {}; save(); applySaved();
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
  // while editing, swallow all clicks so links/buttons don't navigate or open the booking flow
  document.addEventListener("click", function (e) {
    if (!editing) return;
    if (e.target.closest("._tbar")) return; // let the toolbar work
    e.preventDefault(); e.stopPropagation();
  }, true);

  document.addEventListener("pointerdown", function (e) {
    if (!editing) return;
    if (e.target.closest("._tbar")) return;
    var el = e.target.closest(SEL); if (!el) return;
    e.preventDefault();
    cur = el; sx = e.clientX; sy = e.clientY;
    var rect = el.getBoundingClientRect();
    mode = (e.clientX > rect.right - 18 && e.clientY > rect.bottom - 18) ? "resize" : "move";
    if (mode === "resize") { startW = el.offsetWidth; startH = el.offsetHeight; }
    else { var c = xy(el); ox = c.x; oy = c.y; }
    el.style.position = el.style.position || "relative";
    preMove = snap(); movedThisDrag = false;
  }, true);
  // show resize cursor near the bottom-right corner while hovering in edit mode
  document.addEventListener("mousemove", function (e) {
    if (!editing || cur) return;
    var el = e.target.closest(SEL); if (!el) { return; }
    var r = el.getBoundingClientRect();
    el.style.cursor = (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) ? "nwse-resize" : "move";
  });
  document.addEventListener("pointermove", function (e) {
    if (!cur) return;
    if (mode === "resize") {
      var w = Math.max(24, snapN(startW + (e.clientX - sx))), h = Math.max(24, snapN(startH + (e.clientY - sy)));
      cur.style.width = w + "px"; cur.style.height = h + "px"; cur.__wh = { w: w, h: h }; movedThisDrag = true;
    } else {
      var x = snapN(ox + (e.clientX - sx)), y = snapN(oy + (e.clientY - sy));
      cur.style.transform = "translate(" + x + "px," + y + "px)"; cur.__xy = { x: x, y: y }; movedThisDrag = true;
    }
  });
  document.addEventListener("pointerup", function () {
    if (!cur) return;
    if (movedThisDrag) {
      var o = store[path(cur)] || {};
      if (cur.__xy) { o.x = cur.__xy.x; o.y = cur.__xy.y; }
      if (cur.__wh) { o.w = cur.__wh.w; o.h = cur.__wh.h; }
      store[path(cur)] = o; save(); if (preMove != null) pushUndo(preMove);
    }
    cur.__xy = null; cur.__wh = null; cur = null; preMove = null;
  });
})();
