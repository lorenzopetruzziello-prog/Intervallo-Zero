/* =====================================================================
   Intervallo Zero
   Sections: CONFIG · SCHEDULE (pure) · CLOCK · SOUND · SCREEN-AWAKE · UI
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------------------- CONFIG ---------------------------- */
  var STORE_KEY = 'intervallo-zero-v2';

  var FIELDS = [
    { key: 'prep',      group: 'rowsTime', label: 'Preparazione',     min: 0, max: 120, step: 5, color: '--prep' },
    { key: 'work',      group: 'rowsTime', label: 'Lavoro',           min: 1, max: 900, step: 5, color: '--work' },
    { key: 'rest',      group: 'rowsTime', label: 'Riposo',           min: 0, max: 900, step: 5, color: '--rest' },
    { key: 'cycleRest', group: 'rowsTime', label: 'Pausa tra cicli',  min: 0, max: 600, step: 5, color: '--cycle' },
    { key: 'rounds',    group: 'rowsReps', label: 'Round',            min: 1, max: 60,  step: 1 },
    { key: 'cycles',    group: 'rowsReps', label: 'Cicli',            min: 1, max: 20,  step: 1 }
  ];

  var PRESETS = [
    { name: 'Tabata',     cfg: { prep: 10, work: 20,  rest: 10, cycleRest: 0,  rounds: 8,  cycles: 1 } },
    { name: 'HIIT 40/20', cfg: { prep: 10, work: 40,  rest: 20, cycleRest: 0,  rounds: 10, cycles: 1 } },
    { name: 'Circuito',   cfg: { prep: 10, work: 45,  rest: 15, cycleRest: 60, rounds: 6,  cycles: 3 } },
    { name: 'EMOM 10',    cfg: { prep: 10, work: 60,  rest: 0,  cycleRest: 0,  rounds: 10, cycles: 1 } },
    { name: 'Boxe',       cfg: { prep: 10, work: 180, rest: 60, cycleRest: 0,  rounds: 12, cycles: 1 } }
  ];

  var PHASE_NAME = { prep: 'Preparati', work: 'Lavoro', rest: 'Riposo', cycleRest: 'Pausa ciclo', done: 'Finito' };

  var state = {
    cfg: Object.assign({}, PRESETS[0].cfg),
    sound: true,
    awake: true
  };

  function fieldByKey(k) { for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === k) return FIELDS[i]; }
  function clampField(f, v) { v = Math.round(Number(v)); if (!isFinite(v)) v = f.min; return Math.min(f.max, Math.max(f.min, v)); }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s) return;
      if (s.cfg) FIELDS.forEach(function (f) { if (s.cfg[f.key] != null) state.cfg[f.key] = clampField(f, s.cfg[f.key]); });
      if (typeof s.sound === 'boolean') state.sound = s.sound;
      if (typeof s.awake === 'boolean') state.awake = s.awake;
    } catch (e) {}
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

  /* ------------------------ SCHEDULE (pure) ------------------------
     Turns the settings into a list of phases with exact start/end times
     in whole milliseconds. Every boundary is a fixed number computed once,
     so nothing is ever added up tick by tick. */
  //#schedule-start
  function buildSchedule(cfg) {
    var phases = [], t = 0;
    function add(type, seconds, round, cycle) {
      if (seconds <= 0) return;
      var ms = seconds * 1000;
      phases.push({ type: type, start: t, end: t + ms, dur: ms, round: round, cycle: cycle });
      t += ms;
    }
    add('prep', cfg.prep, 0, 1);
    for (var c = 1; c <= cfg.cycles; c++) {
      for (var r = 1; r <= cfg.rounds; r++) {
        add('work', cfg.work, r, c);
        if (r < cfg.rounds) add('rest', cfg.rest, r, c);
        else if (c < cfg.cycles) add('cycleRest', cfg.cycleRest, r, c);
      }
    }
    return { phases: phases, total: t };
  }
  function phaseIndexAt(phases, ms) {
    var lo = 0, hi = phases.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (ms < phases[mid].end) hi = mid; else lo = mid + 1; }
    return lo;
  }
  //#schedule-end

  var plan = buildSchedule(state.cfg);

  /* ----------------------------- CLOCK -----------------------------
     Elapsed time = time banked before the last pause
                  + (performance.now() − moment of the last start).
     performance.now() is a monotonic high-resolution counter: redraw
     timing can be late, the measured time cannot drift. */
  var clock = { running: false, banked: 0, startedAt: 0 };
  var finished = false;
  var idx = 0;

  function now() { return performance.now(); }
  function elapsed() { return clock.banked + (clock.running ? now() - clock.startedAt : 0); }
  function clockStart() { if (!clock.running) { clock.running = true; clock.startedAt = now(); } }
  function clockStop() { if (clock.running) { clock.banked = elapsed(); clock.running = false; } }
  function clockSet(ms) { clock.banked = ms; if (clock.running) clock.startedAt = now(); }

  /* ----------------------------- SOUND -----------------------------
     Beeps are queued on the audio hardware clock up to 2.5 s ahead,
     so they land on the exact second even if the page is busy. */
  var audio = { ctx: null, voices: [], queued: {} };
  var LOOKAHEAD = 2500;

  function audioUnlock() {
    try {
      if (!audio.ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audio.ctx = new AC(); }
      if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    } catch (e) {}
  }
  function tone(freq, at, dur, vol) {
    var ctx = audio.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(at); o.stop(at + dur + 0.03);
    audio.voices.push(o);
    o.onended = function () { var i = audio.voices.indexOf(o); if (i > -1) audio.voices.splice(i, 1); };
  }
  function sound(kind, at) {
    switch (kind) {
      case 'count':     return tone(880, at, 0.10, 0.4);
      case 'work':      return tone(1320, at, 0.55, 0.55);
      case 'rest':      return tone(660, at, 0.55, 0.5);
      case 'cycleRest': return tone(520, at, 0.7, 0.5);
      case 'prep':      return tone(780, at, 0.25, 0.4);
      case 'end':       tone(1320, at, 0.18, 0.55); tone(1320, at + 0.25, 0.18, 0.55); return tone(1760, at + 0.5, 0.7, 0.55);
    }
  }
  function soundsCancel() {
    audio.voices.slice().forEach(function (o) { try { o.stop(); } catch (e) {} });
    audio.voices = []; audio.queued = {};
  }
  function soundsQueue(el) {
    if (!state.sound || !audio.ctx || !clock.running) return;
    var horizon = el + LOOKAHEAD, ph = plan.phases;
    for (var i = idx; i < ph.length; i++) {
      var p = ph[i];
      if (p.start > horizon) break;
      var events = [[p.start, p.type]];
      if (p.dur >= 4000) events.push([p.end - 3000, 'count'], [p.end - 2000, 'count'], [p.end - 1000, 'count']);
      if (i === ph.length - 1) events.push([p.end, 'end']);
      for (var j = 0; j < events.length; j++) {
        var at = events[j][0], kind = events[j][1], id = i + '|' + at + '|' + kind;
        if (at > horizon || audio.queued[id]) continue;
        audio.queued[id] = true;
        if (at < el - 50) continue;
        sound(kind, audio.ctx.currentTime + Math.max(0, (at - el) / 1000));
      }
    }
  }

  /* -------------------------- SCREEN AWAKE --------------------------
     1) Screen Wake Lock API.  2) Fallback: a silent looping video.
     Both need a tap first, so we retry on every touch until one holds. */
  var awake = { lock: null, video: null };
  function videoEl() {
    if (awake.video) return awake.video;
    var v = document.createElement('video');
    v.muted = true; v.loop = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01;pointer-events:none';
    v.src = 'assets/keep-awake.mp4';
    document.body.appendChild(v);
    return (awake.video = v);
  }
  function videoPlay() { try { var p = videoEl().play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  function videoPause() { try { if (awake.video) awake.video.pause(); } catch (e) {} }
  function keepAwake() {
    if (!state.awake || document.visibilityState !== 'visible' || awake.lock) return;
    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function (l) {
        awake.lock = l; videoPause();
        // The system can drop the lock (battery saver, tab switch): ask again right away.
        l.addEventListener('release', function () { awake.lock = null; setTimeout(keepAwake, 300); });
      }).catch(videoPlay);
    } else {
      videoPlay();
    }
  }
  function awakeHolding() { return !!awake.lock || (awake.video && !awake.video.paused); }
  function letSleep() { try { if (awake.lock) awake.lock.release(); } catch (e) {} awake.lock = null; videoPause(); }

  /* ------------------------------ UI ------------------------------ */
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    setup: $('setup'), run: $('run'), sumTotal: $('sumTotal'), sumInfo: $('sumInfo'), presets: $('presets'),
    phaseName: $('phaseName'), digits: $('digits'), nextUp: $('nextUp'), totRemain: $('totRemain'),
    track: $('track'), statRound: $('statRound'), statCycle: $('statCycle'), playIcon: $('playIcon'), playBtn: $('playBtn')
  };
  var ICON = {
    play: '<path d="M7 4.5v15L19.5 12z"/>',
    pause: '<path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/>',
    again: '<path d="M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z"/>'
  };

  function two(n) { return n < 10 ? '0' + n : '' + n; }
  function fmt(sec) {
    sec = Math.max(0, sec);
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h ? h + ':' + two(m) + ':' + two(s) : two(m) + ':' + two(s);
  }
  function shortDur(sec) { return sec < 60 ? sec + 's' : Math.floor(sec / 60) + ':' + two(sec % 60) + ' min'; }

  var painted = {};
  function paint(node, key, value, asHTML) {
    if (painted[key] === value) return;
    painted[key] = value;
    if (asHTML) node.innerHTML = value; else node.textContent = value;
  }

  /* ---- Setup screen ---- */
  function buildRows() {
    FIELDS.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        (f.color ? '<span class="swatch" style="--c: var(' + f.color + ')"></span>' : '') +
        '<label for="in-' + f.key + '">' + f.label + '</label>' +
        '<div class="stepper">' +
          '<button type="button" data-key="' + f.key + '" data-dir="-1" aria-label="Meno ' + f.label + '">−</button>' +
          '<input id="in-' + f.key + '" type="number" inputmode="numeric" min="' + f.min + '" max="' + f.max + '" value="' + state.cfg[f.key] + '">' +
          '<button type="button" data-key="' + f.key + '" data-dir="1" aria-label="Più ' + f.label + '">+</button>' +
        '</div>';
      $(f.group).appendChild(row);
    });
  }
  function buildPresets() {
    PRESETS.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = p.name; b.dataset.i = i;
      el.presets.appendChild(b);
    });
  }
  function setValue(key, v) {
    var f = fieldByKey(key);
    state.cfg[key] = clampField(f, v);
    $('in-' + key).value = state.cfg[key];
    configChanged();
  }
  function nudge(key, dir) {
    var f = fieldByKey(key), cur = state.cfg[key], next;
    if (f.step > 1) next = dir > 0 ? Math.floor(cur / f.step) * f.step + f.step : Math.ceil(cur / f.step) * f.step - f.step;
    else next = cur + dir;
    setValue(key, next);
  }
  function configChanged() {
    save();
    plan = buildSchedule(state.cfg);
    paintSummary();
  }
  function paintSummary() {
    var c = state.cfg;
    el.sumTotal.textContent = fmt(plan.total / 1000);
    var info = c.rounds + ' round · ' + shortDur(c.work) + ' lavoro' + (c.rest ? ' / ' + shortDur(c.rest) + ' riposo' : '');
    if (c.cycles > 1) info += ' · ' + c.cycles + ' cicli';
    el.sumInfo.textContent = info;
    Array.prototype.forEach.call(el.presets.children, function (b) {
      var p = PRESETS[b.dataset.i].cfg;
      var same = FIELDS.every(function (f) { return p[f.key] === c[f.key]; });
      b.setAttribute('aria-pressed', same ? 'true' : 'false');
    });
  }

  // Steppers: tap = one step, hold = repeat faster.
  var hold = { t: null, i: null };
  function holdStop() { clearTimeout(hold.t); clearInterval(hold.i); hold.t = hold.i = null; }
  function wireSteppers(container) {
    container.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('button[data-key]'); if (!b) return;
      e.preventDefault();
      var k = b.dataset.key, d = Number(b.dataset.dir);
      nudge(k, d);
      holdStop();
      hold.t = setTimeout(function () { hold.i = setInterval(function () { nudge(k, d); }, 90); }, 420);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { container.addEventListener(ev, holdStop); });
    container.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-key]');
      if (b && e.detail === 0) nudge(b.dataset.key, Number(b.dataset.dir)); // keyboard activation
    });
    container.addEventListener('change', function (e) {
      if (e.target.matches('input[type="number"]')) setValue(e.target.id.slice(3), e.target.value);
    });
  }

  /* ---- Run screen ---- */
  function buildTrack() {
    el.track.innerHTML = '';
    for (var r = 0; r < state.cfg.rounds; r++) {
      var s = document.createElement('div'); s.className = 'seg'; s.appendChild(document.createElement('i'));
      el.track.appendChild(s);
    }
    painted = {};
  }
  function paintTrack(p, el2) {
    var segs = el.track.children, rounds = state.cfg.rounds;
    for (var r = 0; r < rounds; r++) {
      var fill;
      if (finished) fill = 1;
      else if (p.type === 'prep') fill = 0;
      else if (r + 1 < p.round) fill = 1;
      else if (r + 1 > p.round) fill = 0;
      else fill = p.type === 'work' ? (el2 - p.start) / p.dur : 1;
      var w = Math.round(Math.min(1, Math.max(0, fill)) * 1000) / 10 + '%';
      if (painted['seg' + r] !== w) { painted['seg' + r] = w; segs[r].firstChild.style.width = w; }
    }
  }
  function render(t) {
    var c = state.cfg, type, remainMs, p, next = '';
    if (finished) {
      type = 'done'; remainMs = 0; p = plan.phases[plan.phases.length - 1];
      next = 'Allenamento completato';
    } else {
      p = plan.phases[idx]; type = p.type; remainMs = p.end - t;
      var n = plan.phases[idx + 1];
      next = n ? 'Poi ' + PHASE_NAME[n.type].toLowerCase() + ' ' + shortDur(n.dur / 1000) : 'Ultima fase';
    }
    if (el.run.dataset.phase !== type) el.run.dataset.phase = type;
    var digits = fmt(Math.ceil(remainMs / 1000));
    paint(el.phaseName, 'phase', PHASE_NAME[type]);
    paint(el.digits, 'digits', digits);
    if (digits.length !== fitLen) fitDigits();
    paint(el.nextUp, 'next', next);
    paint(el.totRemain, 'tot', fmt(Math.ceil((plan.total - Math.min(t, plan.total)) / 1000)));
    paint(el.statRound, 'round', (finished ? c.rounds : p.round) + '<small>/' + c.rounds + '</small>', true);
    paint(el.statCycle, 'cycle', (finished ? c.cycles : p.cycle) + '<small>/' + c.cycles + '</small>', true);
    paintTrack(p, t);
  }
  // Size the digits to the space really available: widest that fits, measured, not guessed.
  var fitLen = 0;
  function fitDigits() {
    if (el.run.hidden) return;
    var box = el.digits.parentNode, d = el.digits;
    var W = box.clientWidth, H = box.clientHeight - el.nextUp.offsetHeight - 6;
    if (W <= 0 || H <= 0) return;
    d.style.fontSize = '100px';
    var s = Math.min((W * 0.96) / d.scrollWidth, (H * 0.96) / d.offsetHeight) * 100;
    d.style.fontSize = Math.max(24, Math.floor(s)) + 'px';
    fitLen = d.textContent.length;
  }
  window.addEventListener('resize', fitDigits);
  if (window.ResizeObserver) new ResizeObserver(function () { fitDigits(); }).observe(el.digits.parentNode);
  window.addEventListener('orientationchange', function () { setTimeout(fitDigits, 250); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitDigits);

  function paintButton() {
    var k = clock.running ? 'pause' : (finished ? 'again' : 'play');
    paint(el.playIcon, 'icon', ICON[k], true);
    el.playBtn.setAttribute('aria-label', { pause: 'Pausa', again: 'Ricomincia', play: 'Riprendi' }[k]);
    el.run.classList.toggle('paused', !clock.running);
  }

  /* ---- Loop ----
     requestAnimationFrame redraws while the page is visible; a tiny worker
     keeps sounds queued if the browser throttles the page. Both only READ
     the clock, they never advance it. */
  var loop = { raf: 0, worker: null };
  function tick() {
    var t = elapsed();
    if (clock.running && t >= plan.total) { complete(); return; }
    if (!finished) idx = phaseIndexAt(plan.phases, t);
    soundsQueue(t);
    render(t);
  }
  function frame() { tick(); if (clock.running) loop.raf = requestAnimationFrame(frame); }
  function loopStart() {
    cancelAnimationFrame(loop.raf); loop.raf = requestAnimationFrame(frame);
    if (!loop.worker) {
      try {
        var src = 'var h=setInterval(function(){postMessage(0)},100);onmessage=function(){clearInterval(h);close()}';
        loop.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        loop.worker.onmessage = tick;
      } catch (e) { loop.worker = null; }
    }
  }
  function loopStop() {
    cancelAnimationFrame(loop.raf); loop.raf = 0;
    if (loop.worker) { try { loop.worker.postMessage(0); loop.worker.terminate(); } catch (e) {} loop.worker = null; }
  }

  /* ---- Actions ---- */
  function play() {
    if (finished) { finished = false; clockSet(0); }
    audioUnlock(); keepAwake();
    clockStart(); audio.queued = {};
    loopStart(); tick(); paintButton();
  }
  function pause() {
    clockStop(); soundsCancel(); loopStop(); tick(); paintButton();
  }
  function complete() {
    clockStop(); clockSet(plan.total); finished = true;
    loopStop(); render(plan.total); paintButton();
  }
  function jump(ms) {
    ms = Math.max(0, Math.min(plan.total, ms));
    soundsCancel(); clockSet(ms);
    if (ms >= plan.total) { complete(); return; }
    finished = false; tick(); paintButton();
  }
  function skipNext() { if (finished) return; jump(plan.phases[phaseIndexAt(plan.phases, elapsed())].end); }
  function skipPrev() {
    if (finished) { jump(plan.phases[plan.phases.length - 1].start); return; }
    var t = elapsed(), i = phaseIndexAt(plan.phases, t), p = plan.phases[i];
    jump(t - p.start > 2000 || i === 0 ? p.start : plan.phases[i - 1].start);
  }
  function openRun() {
    plan = buildSchedule(state.cfg);
    clock = { running: false, banked: 0, startedAt: 0 }; finished = false; idx = 0;
    buildTrack();
    el.setup.hidden = true; $('startBar').hidden = true; el.run.hidden = false;
    window.scrollTo(0, 0);
    play();
    fitDigits();
  }
  function closeRun() {
    clockStop(); soundsCancel(); loopStop();
    clock = { running: false, banked: 0, startedAt: 0 }; finished = false; idx = 0;
    el.run.hidden = true; el.setup.hidden = false; $('startBar').hidden = false;
  }

  /* ---- Wiring ---- */
  load();
  plan = buildSchedule(state.cfg);
  buildRows(); buildPresets();
  wireSteppers($('rowsTime')); wireSteppers($('rowsReps'));
  paintSummary();

  el.presets.addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    var p = PRESETS[b.dataset.i].cfg;
    FIELDS.forEach(function (f) { state.cfg[f.key] = p[f.key]; $('in-' + f.key).value = p[f.key]; });
    configChanged();
  });
  $('optSound').checked = state.sound;
  $('optAwake').checked = state.awake;
  // Replay the switch pulse on every change.
  function pulse(input) { var t = input.nextElementSibling; t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse'); }
  $('optSound').addEventListener('change', function (e) { pulse(e.target); state.sound = e.target.checked; save(); if (!state.sound) soundsCancel(); else audioUnlock(); });
  $('optAwake').addEventListener('change', function (e) { pulse(e.target); state.awake = e.target.checked; save(); if (state.awake) keepAwake(); else letSleep(); });

  $('startBtn').addEventListener('click', function () {
    // Ask for real fullscreen (works on Android and desktop; iPhone ignores it, harmless).
    try {
      var d = document.documentElement, fs = d.requestFullscreen || d.webkitRequestFullscreen;
      if (fs) { var r = fs.call(d); if (r && r.catch) r.catch(function () {}); }
    } catch (e) {}
    openRun();
  });

  $('closeBtn').addEventListener('click', function () {
    closeRun();
    try {
      if (document.fullscreenElement && document.exitFullscreen) { var r = document.exitFullscreen(); if (r && r.catch) r.catch(function () {}); }
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
  });
  $('playBtn').addEventListener('click', function () { clock.running ? pause() : play(); });
  $('prevBtn').addEventListener('click', skipPrev);
  $('nextBtn').addEventListener('click', skipNext);

  document.addEventListener('keydown', function (e) {
    if (el.run.hidden) return;
    if (e.code === 'Space') { e.preventDefault(); clock.running ? pause() : play(); }
    else if (e.key === 'ArrowRight') skipNext();
    else if (e.key === 'ArrowLeft') skipPrev();
    else if (e.key === 'Escape') closeRun();
  });
  // Screen on from the moment the page opens, no tap needed where the browser allows it.
  // A watchdog re-arms it every 5 s if anything switched it off. Any touch also re-arms it.
  keepAwake();
  setInterval(function () { if (state.awake && !awakeHolding()) keepAwake(); }, 5000);
  window.addEventListener('pageshow', keepAwake);
  window.addEventListener('focus', keepAwake);
  document.addEventListener('pointerdown', function () { if (state.awake && !awake.lock) keepAwake(); }, true);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    keepAwake();
    if (clock.running) loopStart();
  });

  /* ---- Offline / installable app ---- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
