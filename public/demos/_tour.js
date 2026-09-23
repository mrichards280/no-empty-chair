/* No Empty Chair — shared guided-tour engine.
   Opt in per page:
     window.NEC_TOUR_ACCENT = '#c25b3a';            // optional accent
     window.NEC_TOUR_HOME   = 'https://noemptychair.co'; // optional
     window.NEC_TOUR = [{ sel:'.hero', t:'Title', d:'One line.' }, ...];
   Then include with `defer`. Card can be dragged, minimized to a bubble
   (pause), and both card + bubble link back to the No Empty Chair homepage. */
(function () {
  var STEPS = window.NEC_TOUR;
  if (!STEPS || !STEPS.length) return;
  var accent = window.NEC_TOUR_ACCENT || '#e0a93a';
  var HOME = window.NEC_TOUR_HOME || 'https://noemptychair.co';
  document.documentElement.style.setProperty('--nt-accent', accent);

  var btn = document.createElement('button');
  btn.id = 'necTourBtn'; btn.type = 'button'; btn.textContent = '✨ Take the tour';
  document.body.appendChild(btn);

  var card = document.createElement('div');
  card.id = 'necTourCard';
  card.innerHTML =
    '<div class="nt-top"><span class="nt-move" title="Drag to move this box">⠿⠿ Drag to move</span>' +
    '<button class="nt-min" type="button" title="Minimize" aria-label="Minimize tour">– Minimize</button></div>' +
    '<div class="nt-step"></div><h4 class="nt-title"></h4><p class="nt-desc"></p>' +
    '<div class="nt-nav"><button class="nt-back" type="button">← Back</button>' +
    '<div class="nt-dots"></div><button class="nt-next" type="button">Next →</button></div>' +
    '<div class="nt-foot"><button class="nt-skip" type="button">End tour</button>' +
    '<a class="nt-home" href="' + HOME + '" target="_blank" rel="noopener">✦ No Empty Chair ↗</a></div>';
  document.body.appendChild(card);

  var bubble = document.createElement('div');
  bubble.id = 'necTourBubble';
  bubble.innerHTML =
    '<button class="nt-resume" type="button">✨ Resume tour <b></b></button>' +
    '<a class="nt-bhome" href="' + HOME + '" target="_blank" rel="noopener" title="No Empty Chair">⌂</a>';
  document.body.appendChild(bubble);

  var elStep = card.querySelector('.nt-step'), elTitle = card.querySelector('.nt-title'),
      elDesc = card.querySelector('.nt-desc'), elDots = card.querySelector('.nt-dots'),
      bBack = card.querySelector('.nt-back'), bNext = card.querySelector('.nt-next'),
      bSkip = card.querySelector('.nt-skip'), bMin = card.querySelector('.nt-min'),
      bResume = bubble.querySelector('.nt-resume'), bCount = bubble.querySelector('.nt-resume b');

  elDots.innerHTML = STEPS.map(function () { return '<i></i>'; }).join('');
  var dots = elDots.querySelectorAll('i');
  var i = 0, cur = null;

  function clearHl() { if (cur) { cur.classList.remove('nt-hl'); cur = null; } }
  // Optional page-provided hook to close any modals the tour opened. Steps may
  // carry an act() to open a modal/drive the UI (used by the bakery concept).
  function runReset() { if (typeof window.NEC_TOUR_RESET === 'function') { try { window.NEC_TOUR_RESET(); } catch (e) {} } }
  function show(n) {
    clearHl(); runReset();
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    var step = STEPS[i];
    if (typeof step.act === 'function') { try { step.act(); } catch (e) {} }
    var target = step.sel && document.querySelector(step.sel);
    if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); cur = target; setTimeout(function () { if (cur === target) target.classList.add('nt-hl'); }, 380); }
    elStep.textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length;
    elTitle.textContent = step.t || ''; elDesc.textContent = step.d || '';
    dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
    bBack.style.visibility = i === 0 ? 'hidden' : 'visible';
    bNext.textContent = i === STEPS.length - 1 ? 'Finish ✓' : 'Next →';
  }
  function resetPos() { card.style.left = ''; card.style.top = ''; card.style.bottom = ''; card.style.transform = ''; }
  function start() { resetPos(); bubble.classList.remove('show'); card.classList.add('show'); btn.style.display = 'none'; show(0); }
  function end() { card.classList.remove('show'); bubble.classList.remove('show'); clearHl(); runReset(); resetPos(); btn.style.display = ''; }
  function minimize() { clearHl(); runReset(); card.classList.remove('show'); bCount.textContent = (i + 1) + '/' + STEPS.length; bubble.classList.add('show'); }
  function resume() { bubble.classList.remove('show'); card.classList.add('show'); show(i); }

  btn.addEventListener('click', start);
  bNext.addEventListener('click', function () { if (i === STEPS.length - 1) end(); else show(i + 1); });
  bBack.addEventListener('click', function () { show(i - 1); });
  bSkip.addEventListener('click', end);
  bMin.addEventListener('click', minimize);
  bResume.addEventListener('click', resume);
  document.addEventListener('keydown', function (e) {
    if (!card.classList.contains('show')) return;
    if (e.key === 'Escape') minimize();
    else if (e.key === 'ArrowRight' && i < STEPS.length - 1) show(i + 1);
    else if (e.key === 'ArrowLeft' && i > 0) show(i - 1);
  });

  // Drag via the top bar or the grip (mouse + touch).
  (function () {
    var handles = [card.querySelector('.nt-top')], dx = 0, dy = 0, drag = false;
    function down(e) {
      if (e.target.closest('.nt-min') || e.target.closest('.nt-home')) return;
      drag = true; var r = card.getBoundingClientRect(); var p = e.touches ? e.touches[0] : e;
      dx = p.clientX - r.left; dy = p.clientY - r.top;
      card.style.left = r.left + 'px'; card.style.top = r.top + 'px'; card.style.bottom = 'auto'; card.style.transform = 'none';
      card.classList.add('dragging'); if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!drag) return; var p = e.touches ? e.touches[0] : e;
      var x = p.clientX - dx, y = p.clientY - dy;
      x = Math.max(6, Math.min(window.innerWidth - card.offsetWidth - 6, x));
      y = Math.max(6, Math.min(window.innerHeight - card.offsetHeight - 6, y));
      card.style.left = x + 'px'; card.style.top = y + 'px'; if (e.cancelable) e.preventDefault();
    }
    function up() { drag = false; card.classList.remove('dragging'); }
    handles.forEach(function (h) { h.addEventListener('mousedown', down); h.addEventListener('touchstart', down, { passive: false }); });
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up);
  })();
})();
