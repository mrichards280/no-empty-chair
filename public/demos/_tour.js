/* No Empty Chair — shared guided-tour engine.
   Opt in per page:
     window.NEC_TOUR_ACCENT = '#c25b3a';           // optional, matches the demo
     window.NEC_TOUR = [{ sel:'.hero', t:'Title', d:'One line.' }, ...];
   Then include this file with `defer`. No dependencies. */
(function () {
  var STEPS = window.NEC_TOUR;
  if (!STEPS || !STEPS.length) return;
  var accent = window.NEC_TOUR_ACCENT || '#e0a93a';
  document.documentElement.style.setProperty('--nt-accent', accent);

  var btn = document.createElement('button');
  btn.id = 'necTourBtn'; btn.type = 'button'; btn.textContent = '✨ Take the tour';
  document.body.appendChild(btn);

  var card = document.createElement('div');
  card.id = 'necTourCard';
  card.innerHTML =
    '<div class="nt-grip" title="Drag to move"></div>' +
    '<div class="nt-step"></div>' +
    '<h4 class="nt-title"></h4>' +
    '<p class="nt-desc"></p>' +
    '<div class="nt-nav"><button class="nt-back" type="button">← Back</button>' +
    '<div class="nt-dots"></div>' +
    '<button class="nt-next" type="button">Next →</button></div>' +
    '<button class="nt-skip" type="button">Skip tour</button>';
  document.body.appendChild(card);

  var elStep = card.querySelector('.nt-step'),
      elTitle = card.querySelector('.nt-title'),
      elDesc = card.querySelector('.nt-desc'),
      elDots = card.querySelector('.nt-dots'),
      bBack = card.querySelector('.nt-back'),
      bNext = card.querySelector('.nt-next'),
      bSkip = card.querySelector('.nt-skip');

  elDots.innerHTML = STEPS.map(function () { return '<i></i>'; }).join('');
  var dots = elDots.querySelectorAll('i');
  var i = 0, cur = null;

  function clearHl() { if (cur) { cur.classList.remove('nt-hl'); cur = null; } }

  function show(n) {
    clearHl();
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    var step = STEPS[i];
    var target = step.sel && document.querySelector(step.sel);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cur = target;
      setTimeout(function () { if (cur === target) target.classList.add('nt-hl'); }, 380);
    }
    elStep.textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length;
    elTitle.textContent = step.t || '';
    elDesc.textContent = step.d || '';
    dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
    bBack.style.visibility = i === 0 ? 'hidden' : 'visible';
    bNext.textContent = i === STEPS.length - 1 ? 'Finish ✓' : 'Next →';
  }

  function resetPos() { card.style.left = ''; card.style.top = ''; card.style.bottom = ''; card.style.transform = ''; }
  function start() { resetPos(); card.classList.add('show'); show(0); }
  function end() { card.classList.remove('show'); clearHl(); resetPos(); }

  btn.addEventListener('click', start);
  bNext.addEventListener('click', function () { if (i === STEPS.length - 1) end(); else show(i + 1); });
  bBack.addEventListener('click', function () { show(i - 1); });
  bSkip.addEventListener('click', end);
  document.addEventListener('keydown', function (e) {
    if (!card.classList.contains('show')) return;
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight') { if (i < STEPS.length - 1) show(i + 1); }
    else if (e.key === 'ArrowLeft') { if (i > 0) show(i - 1); }
  });

  // Draggable card via the grip (mouse + touch).
  (function () {
    var grip = card.querySelector('.nt-grip'), dx = 0, dy = 0, drag = false;
    function down(e) {
      drag = true; var r = card.getBoundingClientRect(); var p = e.touches ? e.touches[0] : e;
      dx = p.clientX - r.left; dy = p.clientY - r.top;
      card.style.left = r.left + 'px'; card.style.top = r.top + 'px';
      card.style.bottom = 'auto'; card.style.transform = 'none';
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
    grip.addEventListener('mousedown', down); document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    grip.addEventListener('touchstart', down, { passive: false }); document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up);
  })();
})();
